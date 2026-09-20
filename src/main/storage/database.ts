import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import type { Vault } from './vault'

const MIGRATIONS: string[] = [
  `
  CREATE TABLE history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    favicon TEXT,
    visited_at INTEGER NOT NULL
  );
  CREATE INDEX idx_history_visited ON history(visited_at DESC);
  CREATE INDEX idx_history_url ON history(url);

  CREATE TABLE bookmarks (
    id TEXT PRIMARY KEY,
    parent_id TEXT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    favicon TEXT,
    position INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_bookmarks_parent ON bookmarks(parent_id, position);

  CREATE TABLE quick_access (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL
  );

  CREATE TABLE downloads (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    filename TEXT NOT NULL,
    save_path TEXT NOT NULL DEFAULT '',
    total_bytes INTEGER NOT NULL DEFAULT 0,
    received_bytes INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL,
    mime TEXT NOT NULL DEFAULT '',
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    error TEXT
  );

  CREATE TABLE favicons (
    host TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `
]

type Row = Record<string, unknown>

/** Every table is persisted inside the encrypted vault; this is the on-disk (decrypted) shape. */
export interface Snapshot {
  format: 1
  tables: Record<string, Row[]>
}

export const TABLES = ['history', 'bookmarks', 'quick_access', 'downloads', 'favicons', 'kv'] as const
const SAVE_DELAY_MS = 2500

/**
 * The database lives in memory (node:sqlite) and is written as an encrypted snapshot, so no plaintext
 * copy of the user's history, bookmarks or downloads ever touches the disk.
 */
export class Database {
  private readonly db = new DatabaseSync(':memory:')
  private dirty = false
  private timer: NodeJS.Timeout | undefined

  constructor(
    private readonly vault: Vault | null,
    snapshot?: Snapshot | null
  ) {
    this.migrate()
    if (snapshot) this.restore(snapshot)
  }

  private migrate(): void {
    for (const sql of MIGRATIONS) this.db.exec(sql)
  }

  private restore(snapshot: Snapshot): void {
    if (snapshot.format !== 1 || typeof snapshot.tables !== 'object') throw new Error('Unsupported data snapshot')
    this.db.exec('BEGIN')
    try {
      for (const table of TABLES) {
        const rows = snapshot.tables[table]
        if (!Array.isArray(rows) || rows.length === 0) continue
        const known = new Set(this.db.prepare(`PRAGMA table_info(${table})`).all().map((c) => String((c as Row).name)))
        for (const row of rows) {
          const cols = Object.keys(row).filter((c) => known.has(c))
          if (cols.length === 0) continue
          this.db
            .prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
            .run(...cols.map((c) => row[c] as SQLInputValue))
        }
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  snapshot(): Snapshot {
    const tables: Record<string, Row[]> = {}
    for (const table of TABLES) tables[table] = this.db.prepare(`SELECT * FROM ${table}`).all() as Row[]
    return { format: 1, tables }
  }

  // ── persistence ─────────────────────────────────────────────────────────
  private markDirty(): void {
    this.dirty = true
    if (!this.vault || this.timer) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.flush()
    }, SAVE_DELAY_MS)
    this.timer.unref()
  }

  /** Marks everything as changed and writes it (first run / migration). */
  persistNow(): void {
    this.dirty = true
    this.flush()
  }

  /** Writes the encrypted snapshot now if anything changed. */
  flush(): void {
    if (!this.dirty || !this.vault) return
    this.dirty = false
    try {
      this.vault.write(this.snapshot())
    } catch (error) {
      this.dirty = true
      console.error('[db] could not save the encrypted snapshot', error)
    }
  }

  // ── query helpers (same API as before) ──────────────────────────────────
  run(sql: string, ...params: SQLInputValue[]): void {
    this.db.prepare(sql).run(...params)
    this.markDirty()
  }

  all<T = Row>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...params) as T[]
  }

  get<T = Row>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN')
    try {
      const result = fn()
      this.db.exec('COMMIT')
      this.markDirty()
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  getKv<T>(key: string): T | null {
    const row = this.get<{ value: string }>('SELECT value FROM kv WHERE key = ?', key)
    if (!row) return null
    try {
      return JSON.parse(row.value) as T
    } catch {
      return null
    }
  }

  setKv(key: string, value: unknown): void {
    this.run(
      'INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      JSON.stringify(value)
    )
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer)
    this.flush()
    try {
      this.db.close()
    } catch {
      /* already closed */
    }
  }
}

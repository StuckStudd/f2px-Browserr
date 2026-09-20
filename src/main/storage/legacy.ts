import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { TABLES, type Snapshot } from './database'

/** Best-effort erase of a plaintext file: overwrite with zeros, then delete (SSDs may still keep remnants). */
export function wipeFile(file: string): void {
  try {
    const { size } = fs.statSync(file)
    fs.writeFileSync(file, Buffer.alloc(size))
  } catch {
    /* missing or locked: fall through to delete */
  }
  fs.rmSync(file, { force: true })
}

/** Reads a pre-encryption `f2px.db` (older versions) into a snapshot. Returns null when there is nothing to import. */
export function readLegacyDatabase(userData: string): Snapshot | null {
  const file = path.join(userData, 'f2px.db')
  if (!fs.existsSync(file)) return null
  let db: DatabaseSync | null = null
  try {
    db = new DatabaseSync(file, { readOnly: true })
    const tables: Snapshot['tables'] = {}
    for (const table of TABLES) {
      try {
        tables[table] = db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]
      } catch {
        tables[table] = []
      }
    }
    return { format: 1, tables }
  } catch (error) {
    console.error('[legacy] could not read the old database, starting fresh', error)
    return null
  } finally {
    try {
      db?.close()
    } catch {
      /* ignore */
    }
  }
}

export function wipeLegacyFiles(userData: string): void {
  for (const name of ['f2px.db', 'f2px.db-wal', 'f2px.db-shm']) wipeFile(path.join(userData, name))
}

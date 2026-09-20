import type { HistoryEntry, HistoryQuery } from '../../shared/types'
import { hostOf } from '../../shared/url'
import type { Database } from '../storage/database'
import { Emitter } from '../utils/emitter'

interface HistoryRow {
  id: number
  url: string
  title: string
  favicon: string | null
  visited_at: number
}

export interface TopSite {
  url: string
  title: string
  favicon: string | null
  visits: number
  lastVisit: number
}

const toEntry = (r: HistoryRow): HistoryEntry => ({
  id: r.id,
  url: r.url,
  title: r.title,
  favicon: r.favicon,
  visitedAt: r.visited_at
})

const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (c) => `\\${c}`)

export class HistoryService {
  readonly onChange = new Emitter()

  constructor(private readonly db: Database) {}

  addVisit(url: string, title: string, favicon: string | null): number | null {
    if (!/^https?:\/\//i.test(url)) return null
    const now = Date.now()
    this.db.run(
      'INSERT INTO history(url, title, favicon, visited_at) VALUES(?, ?, ?, ?)',
      url,
      title.slice(0, 300),
      favicon,
      now
    )
    const row = this.db.get<{ id: number }>('SELECT last_insert_rowid() AS id')
    this.onChange.emit()
    return row?.id ?? null
  }

  updateVisit(id: number, patch: { title?: string; favicon?: string | null }): void {
    if (patch.title !== undefined) this.db.run('UPDATE history SET title = ? WHERE id = ?', patch.title.slice(0, 300), id)
    if (patch.favicon !== undefined) this.db.run('UPDATE history SET favicon = ? WHERE id = ?', patch.favicon, id)
    this.onChange.emit()
  }

  list(query: HistoryQuery = {}): HistoryEntry[] {
    const limit = Math.min(Math.max(query.limit ?? 500, 1), 5000)
    const offset = Math.max(query.offset ?? 0, 0)
    const text = query.query?.trim()
    const rows = text
      ? this.db.all<HistoryRow>(
          `SELECT * FROM history WHERE title LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\'
           ORDER BY visited_at DESC LIMIT ? OFFSET ?`,
          `%${escapeLike(text)}%`,
          `%${escapeLike(text)}%`,
          limit,
          offset
        )
      : this.db.all<HistoryRow>('SELECT * FROM history ORDER BY visited_at DESC LIMIT ? OFFSET ?', limit, offset)
    return rows.map(toEntry)
  }

  remove(ids: number[]): void {
    const valid = ids.filter((id) => Number.isInteger(id))
    if (valid.length === 0) return
    this.db.transaction(() => {
      for (const id of valid) this.db.run('DELETE FROM history WHERE id = ?', id)
    })
    this.onChange.emit()
  }

  clear(): void {
    this.db.transaction(() => {
      this.db.run('DELETE FROM history')
      this.db.run('DELETE FROM favicons')
    })
    this.onChange.emit()
  }

  /** Most visited pages first; used by the omnibox and as fallback suggestions. */
  topSites(limit = 6): TopSite[] {
    return this.db
      .all<HistoryRow & { visits: number; last: number }>(
        `SELECT url, title, favicon, COUNT(*) AS visits, MAX(visited_at) AS last
         FROM history GROUP BY url ORDER BY visits DESC, last DESC LIMIT ?`,
        limit
      )
      .map((r) => ({ url: r.url, title: r.title, favicon: r.favicon, visits: r.visits, lastVisit: r.last }))
  }

  suggest(query: string, limit = 5): TopSite[] {
    const like = `%${escapeLike(query.trim())}%`
    return this.db
      .all<HistoryRow & { visits: number; last: number }>(
        `SELECT url, title, favicon, COUNT(*) AS visits, MAX(visited_at) AS last
         FROM history WHERE url LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\'
         GROUP BY url ORDER BY visits DESC, last DESC LIMIT ?`,
        like,
        like,
        limit
      )
      .map((r) => ({ url: r.url, title: r.title, favicon: r.favicon, visits: r.visits, lastVisit: r.last }))
  }

  /** Has this host been opened before? (used to warn only about *new* look-alike addresses) */
  hasHost(host: string): boolean {
    const h = escapeLike(host)
    const patterns = [`http://${h}/%`, `https://${h}/%`, `http://${h}:%`, `https://${h}:%`]
    const where = patterns.map(() => "url LIKE ? ESCAPE '\\'").join(' OR ')
    return !!this.db.get(`SELECT 1 AS x FROM history WHERE ${where} LIMIT 1`, ...patterns)
  }

  saveFavicon(pageUrl: string, faviconUrl: string): void {
    const host = hostOf(pageUrl)
    if (!host || !/^https?:|^data:/i.test(faviconUrl)) return
    this.db.run(
      `INSERT INTO favicons(host, url, updated_at) VALUES(?, ?, ?)
       ON CONFLICT(host) DO UPDATE SET url = excluded.url, updated_at = excluded.updated_at`,
      host,
      faviconUrl,
      Date.now()
    )
  }

  faviconsForHosts(hosts: string[]): Record<string, string> {
    const out: Record<string, string> = {}
    for (const host of hosts.slice(0, 100)) {
      const row = this.db.get<{ url: string }>('SELECT url FROM favicons WHERE host = ?', host)
      if (row) out[host] = row.url
    }
    return out
  }
}

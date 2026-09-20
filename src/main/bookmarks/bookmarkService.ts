import { randomUUID } from 'node:crypto'
import type { Bookmark } from '../../shared/types'
import { isWebUrl, normalizeWebUrl } from '../../shared/url'
import type { Database } from '../storage/database'
import { Emitter } from '../utils/emitter'
import { exportNetscape, parseNetscape } from './netscape'

interface BookmarkRow {
  id: string
  parent_id: string | null
  type: 'bookmark' | 'folder'
  title: string
  url: string
  favicon: string | null
  position: number
  created_at: number
}

const toBookmark = (r: BookmarkRow): Bookmark => ({
  id: r.id,
  parentId: r.parent_id,
  type: r.type,
  title: r.title,
  url: r.url,
  favicon: r.favicon,
  position: r.position,
  createdAt: r.created_at
})

export class BookmarkService {
  readonly onChange = new Emitter()

  constructor(private readonly db: Database) {}

  /** Flat list ordered by parent and position; the renderer builds the tree. */
  tree(): Bookmark[] {
    return this.db
      .all<BookmarkRow>('SELECT * FROM bookmarks ORDER BY parent_id, position')
      .map(toBookmark)
  }

  get(id: string): Bookmark | null {
    const row = this.db.get<BookmarkRow>('SELECT * FROM bookmarks WHERE id = ?', id)
    return row ? toBookmark(row) : null
  }

  findByUrl(url: string): Bookmark | null {
    const row = this.db.get<BookmarkRow>("SELECT * FROM bookmarks WHERE type = 'bookmark' AND url = ? LIMIT 1", url)
    return row ? toBookmark(row) : null
  }

  private nextPosition(parentId: string | null): number {
    const row = this.db.get<{ p: number | null }>(
      'SELECT MAX(position) AS p FROM bookmarks WHERE parent_id IS ?',
      parentId
    )
    return (row?.p ?? -1) + 1
  }

  private insert(type: 'bookmark' | 'folder', title: string, url: string, parentId: string | null, favicon: string | null): Bookmark {
    const parent = parentId && this.get(parentId)?.type === 'folder' ? parentId : null
    const id = randomUUID()
    this.db.run(
      'INSERT INTO bookmarks(id, parent_id, type, title, url, favicon, position, created_at) VALUES(?,?,?,?,?,?,?,?)',
      id,
      parent,
      type,
      title.trim().slice(0, 200) || (type === 'folder' ? 'New folder' : url),
      url,
      favicon,
      this.nextPosition(parent),
      Date.now()
    )
    return this.get(id) as Bookmark
  }

  add(input: { title: string; url: string; parentId?: string | null; favicon?: string | null }): Bookmark {
    const url = normalizeWebUrl(input.url)
    if (!url) throw new Error('Only http(s) addresses can be bookmarked')
    const created = this.insert('bookmark', input.title, url, input.parentId ?? null, input.favicon ?? null)
    this.onChange.emit()
    return created
  }

  createFolder(title: string, parentId: string | null = null): Bookmark {
    const created = this.insert('folder', title, '', parentId, null)
    this.onChange.emit()
    return created
  }

  update(id: string, patch: { title?: string; url?: string }): Bookmark | null {
    const current = this.get(id)
    if (!current) return null
    const title = patch.title !== undefined ? patch.title.trim().slice(0, 200) || current.title : current.title
    let url = current.url
    if (current.type === 'bookmark' && patch.url !== undefined) {
      const normalized = normalizeWebUrl(patch.url)
      if (!normalized) throw new Error('Invalid address')
      url = normalized
    }
    this.db.run('UPDATE bookmarks SET title = ?, url = ? WHERE id = ?', title, url, id)
    this.onChange.emit()
    return this.get(id)
  }

  private isDescendant(id: string, ancestorId: string): boolean {
    let cursor: string | null = id
    for (let guard = 0; cursor && guard < 64; guard++) {
      if (cursor === ancestorId) return true
      cursor = this.get(cursor)?.parentId ?? null
    }
    return false
  }

  move(id: string, parentId: string | null, index: number): void {
    const item = this.get(id)
    if (!item) return
    if (parentId !== null) {
      const parent = this.get(parentId)
      if (!parent || parent.type !== 'folder') return
      if (this.isDescendant(parentId, id)) return // a folder cannot move into itself
    }
    this.db.transaction(() => {
      const siblings = this.db
        .all<BookmarkRow>('SELECT * FROM bookmarks WHERE parent_id IS ? AND id != ? ORDER BY position', parentId, id)
        .map((r) => r.id)
      siblings.splice(Math.min(Math.max(index, 0), siblings.length), 0, id)
      this.db.run('UPDATE bookmarks SET parent_id = ? WHERE id = ?', parentId, id)
      siblings.forEach((sid, pos) => this.db.run('UPDATE bookmarks SET position = ? WHERE id = ?', pos, sid))
    })
    this.onChange.emit()
  }

  remove(id: string): void {
    this.db.transaction(() => {
      const doomed: string[] = []
      const walk = (current: string): void => {
        doomed.push(current)
        for (const child of this.db.all<{ id: string }>('SELECT id FROM bookmarks WHERE parent_id = ?', current)) {
          walk(child.id)
        }
      }
      walk(id)
      for (const d of doomed) this.db.run('DELETE FROM bookmarks WHERE id = ?', d)
    })
    this.onChange.emit()
  }

  updateFavicon(url: string, favicon: string): void {
    this.db.run("UPDATE bookmarks SET favicon = ? WHERE type = 'bookmark' AND url = ?", favicon, url)
  }

  importHtml(html: string): number {
    const nodes = parseNetscape(html)
    let count = 0
    this.db.transaction(() => {
      const idMap = new Map<number, string>()
      for (const [index, node] of nodes.entries()) {
        const parentId = node.parent === null ? null : (idMap.get(node.parent) ?? null)
        if (node.type === 'folder') {
          idMap.set(index, this.insert('folder', node.title, '', parentId, null).id)
        } else if (isWebUrl(node.url)) {
          this.insert('bookmark', node.title, node.url, parentId, null)
          count++
        }
      }
    })
    this.onChange.emit()
    return count
  }

  exportHtml(): string {
    return exportNetscape(this.tree())
  }
}

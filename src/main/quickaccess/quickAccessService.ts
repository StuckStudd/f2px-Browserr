import { randomUUID } from 'node:crypto'
import { DEFAULT_QUICK_ACCESS } from '../../shared/settings'
import type { QuickAccessItem } from '../../shared/types'
import { normalizeWebUrl } from '../../shared/url'
import type { Database } from '../storage/database'
import { Emitter } from '../utils/emitter'

interface Row {
  id: string
  title: string
  url: string
  icon: string
  position: number
}

const ICON_PATTERN = /^(text:.{1,3}|https?:\/\/.+|data:image\/(png|jpeg|webp|gif|svg\+xml|x-icon);base64,[A-Za-z0-9+/=]+)$/
const MAX_ICON_LENGTH = 300_000

function cleanIcon(icon: string | undefined): string {
  if (!icon) return ''
  return icon.length <= MAX_ICON_LENGTH && ICON_PATTERN.test(icon) ? icon : ''
}

const toItem = (r: Row): QuickAccessItem => ({ id: r.id, title: r.title, url: r.url, icon: r.icon, position: r.position })

export class QuickAccessService {
  readonly onChange = new Emitter()

  constructor(private readonly db: Database) {
    // Seeded once, so removing a default tile stays removed.
    if (!this.db.getKv<boolean>('quickAccessSeeded')) {
      this.seed()
      this.db.setKv('quickAccessSeeded', true)
    }
  }

  private seed(): void {
    this.db.transaction(() => {
      this.db.run('DELETE FROM quick_access')
      DEFAULT_QUICK_ACCESS.forEach((d, i) =>
        this.db.run('INSERT INTO quick_access(id, title, url, icon, position) VALUES(?,?,?,?,?)', randomUUID(), d.title, d.url, '', i)
      )
    })
  }

  list(): QuickAccessItem[] {
    return this.db.all<Row>('SELECT * FROM quick_access ORDER BY position').map(toItem)
  }

  add(input: { title: string; url: string; icon?: string }): QuickAccessItem {
    const url = normalizeWebUrl(input.url)
    if (!url) throw new Error('Invalid address')
    const id = randomUUID()
    const position = (this.db.get<{ p: number | null }>('SELECT MAX(position) AS p FROM quick_access')?.p ?? -1) + 1
    const title = input.title.trim().slice(0, 40) || new URL(url).hostname.replace(/^www\./, '')
    this.db.run('INSERT INTO quick_access(id, title, url, icon, position) VALUES(?,?,?,?,?)', id, title, url, cleanIcon(input.icon), position)
    this.onChange.emit()
    return toItem(this.db.get<Row>('SELECT * FROM quick_access WHERE id = ?', id) as Row)
  }

  update(id: string, patch: { title?: string; url?: string; icon?: string }): QuickAccessItem | null {
    const current = this.db.get<Row>('SELECT * FROM quick_access WHERE id = ?', id)
    if (!current) return null
    let url = current.url
    if (patch.url !== undefined) {
      const normalized = normalizeWebUrl(patch.url)
      if (!normalized) throw new Error('Invalid address')
      url = normalized
    }
    const title = patch.title !== undefined ? patch.title.trim().slice(0, 40) || current.title : current.title
    const icon = patch.icon !== undefined ? cleanIcon(patch.icon) : current.icon
    this.db.run('UPDATE quick_access SET title = ?, url = ?, icon = ? WHERE id = ?', title, url, icon, id)
    this.onChange.emit()
    return toItem(this.db.get<Row>('SELECT * FROM quick_access WHERE id = ?', id) as Row)
  }

  remove(id: string): void {
    this.db.run('DELETE FROM quick_access WHERE id = ?', id)
    this.onChange.emit()
  }

  reorder(orderedIds: string[]): void {
    this.db.transaction(() => {
      orderedIds.forEach((id, position) => this.db.run('UPDATE quick_access SET position = ? WHERE id = ?', position, id))
    })
    this.onChange.emit()
  }

  reset(): QuickAccessItem[] {
    this.seed()
    this.onChange.emit()
    return this.list()
  }
}

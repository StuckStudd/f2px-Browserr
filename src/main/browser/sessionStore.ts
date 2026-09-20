import type { Database } from '../storage/database'

export interface SavedTab {
  url: string
  title: string
  pinned: boolean
}

export interface SavedWindow {
  tabs: SavedTab[]
  activeIndex: number
}

export interface SavedSession {
  windows: SavedWindow[]
}

const KEY = 'session'

/** Last browsing session (open tabs), persisted so it can be restored on the next launch. */
export class SessionStore {
  constructor(private readonly db: Database) {}

  save(session: SavedSession): void {
    this.db.setKv(KEY, session)
  }

  load(): SavedSession | null {
    const raw = this.db.getKv<SavedSession>(KEY)
    if (!raw || !Array.isArray(raw.windows)) return null
    const windows = raw.windows
      .map((w) => ({
        activeIndex: Number.isInteger(w.activeIndex) ? w.activeIndex : 0,
        tabs: (Array.isArray(w.tabs) ? w.tabs : [])
          .filter((t) => typeof t?.url === 'string' && t.url.length > 0)
          .map((t) => ({ url: t.url, title: typeof t.title === 'string' ? t.title : '', pinned: !!t.pinned }))
      }))
      .filter((w) => w.tabs.length > 0)
    return windows.length > 0 ? { windows } : null
  }

  clear(): void {
    this.db.setKv(KEY, { windows: [] })
  }
}

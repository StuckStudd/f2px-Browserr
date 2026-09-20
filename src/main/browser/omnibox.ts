import type { Session } from 'electron'
import { SEARCH_ENGINES } from '../../shared/settings'
import type { Suggestion } from '../../shared/types'
import { resolveInput } from '../../shared/url'
import type { BookmarkService } from '../bookmarks/bookmarkService'
import type { HistoryService } from '../history/historyService'
import type { SettingsService } from '../settings/settingsService'

export class Omnibox {
  constructor(
    private readonly history: HistoryService,
    private readonly bookmarks: BookmarkService,
    private readonly settings: SettingsService
  ) {}

  /** Local suggestions: what Enter would do, bookmarks, history and (when empty) top sites. */
  suggest(query: string): Suggestion[] {
    const text = query.trim()
    if (!text) {
      return this.history.topSites(6).map((s) => ({
        kind: 'top' as const,
        title: s.title || s.url,
        value: s.url,
        detail: s.url,
        favicon: s.favicon
      }))
    }

    const engine = SEARCH_ENGINES[this.settings.get().searchEngine]
    const resolved = resolveInput(text, engine.id)
    const out: Suggestion[] = []
    if (resolved) {
      out.push(
        resolved.kind === 'url'
          ? { kind: 'action', title: resolved.url, value: resolved.url, detail: 'Open address', favicon: null }
          : { kind: 'action', title: text, value: text, detail: `Search ${engine.name}`, favicon: null }
      )
    }

    const needle = text.toLowerCase()
    const seen = new Set<string>()
    for (const b of this.bookmarks.tree()) {
      if (b.type !== 'bookmark') continue
      if (!b.title.toLowerCase().includes(needle) && !b.url.toLowerCase().includes(needle)) continue
      seen.add(b.url)
      out.push({ kind: 'bookmark', title: b.title, value: b.url, detail: b.url, favicon: b.favicon })
      if (seen.size >= 3) break
    }
    for (const h of this.history.suggest(text, 6)) {
      if (seen.has(h.url)) continue
      seen.add(h.url)
      out.push({ kind: 'history', title: h.title || h.url, value: h.url, detail: h.url, favicon: h.favicon })
      if (out.length >= 9) break
    }
    return out
  }

  /** Suggestions from the chosen search engine. Only sent when the user has this enabled. */
  async remote(query: string, ses: Session | null): Promise<string[]> {
    const text = query.trim()
    const settings = this.settings.get()
    if (!ses || !settings.searchSuggestions || text.length < 2 || text.length > 100) return []
    try {
      const url = SEARCH_ENGINES[settings.searchEngine].suggestUrl.replace('%s', encodeURIComponent(text))
      const response = await ses.fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(2500) })
      if (!response.ok) return []
      const data: unknown = await response.json()
      const list = Array.isArray(data) ? data[1] : null
      return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string').slice(0, 6) : []
    } catch {
      return []
    }
  }
}

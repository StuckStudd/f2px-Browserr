import type {
  AppEnv,
  Bookmark,
  ClearDataOptions,
  DownloadRecord,
  FindState,
  HistoryEntry,
  HistoryQuery,
  OverlayMenuItem,
  QuickAccessItem,
  PrivacyStats,
  SecurityStatus,
  Settings,
  ShellState,
  Suggestion,
  ThreatListStatus,
  UpdateStatus
} from './types'
import type { InternalPage } from './url'

export const RPC_CHANNEL = 'f2px:rpc'
export const EVENT_CHANNEL = 'f2px:event'

/**
 * Every request the renderers can make. A single typed RPC surface keeps the preloads tiny
 * and lets the main process authorise each method per caller (see `main/ipc/rpc.ts`).
 */
export interface RpcMethods {
  // ── browser shell (address bar / tabs) ────────────────────────────────
  'shell.state': () => ShellState
  'tabs.create': (opts?: { url?: string; background?: boolean }) => void
  'tabs.close': (id: number) => void
  'tabs.activate': (id: number) => void
  'tabs.move': (id: number, toIndex: number) => void
  'tabs.pin': (id: number, pinned: boolean) => void
  'tabs.mute': (id: number, muted: boolean) => void
  'tabs.duplicate': (id: number) => void
  'tabs.closeOthers': (id: number) => void
  'tabs.closeToRight': (id: number) => void
  'tabs.reopen': () => void
  'nav.go': (input: string, opts?: { newTab?: boolean }) => void
  'nav.back': () => void
  'nav.forward': () => void
  'nav.reload': (hard?: boolean) => void
  'nav.stop': () => void
  'nav.home': () => void
  'omnibox.suggest': (query: string) => Suggestion[]
  'omnibox.remote': (query: string) => Promise<string[]>
  'ui.overlay': (open: boolean) => void
  'ui.menuSelect': (menuId: number, itemId: string | null) => void
  'ui.openPage': (page: InternalPage) => void
  'ui.newWindow': (isPrivate: boolean) => void
  'ui.focusPage': () => void
  'ui.print': () => void
  'ui.devtools': () => void
  'ui.fullscreen': () => void
  'ui.zoom': (dir: 'in' | 'out' | 'reset') => void
  'ui.findBar': (open: boolean) => void
  'find.start': (text: string, forward?: boolean, matchCase?: boolean) => void
  'find.stop': () => void
  /** Bookmarks the active page if it is not bookmarked yet and returns the bookmark. */
  'bookmarks.ensureActive': () => Bookmark | null

  // ── shared data services ──────────────────────────────────────────────
  'settings.get': () => Settings
  'settings.update': (patch: Partial<Settings>) => Settings
  'history.list': (query?: HistoryQuery) => HistoryEntry[]
  'history.remove': (ids: number[]) => void
  'history.clear': () => void
  'bookmarks.tree': () => Bookmark[]
  'bookmarks.add': (input: { title: string; url: string; parentId?: string | null }) => Bookmark
  'bookmarks.folder': (title: string, parentId?: string | null) => Bookmark
  'bookmarks.update': (id: string, patch: { title?: string; url?: string }) => Bookmark | null
  'bookmarks.move': (id: string, parentId: string | null, index: number) => void
  'bookmarks.remove': (id: string) => void
  'quickAccess.list': () => QuickAccessItem[]
  'quickAccess.add': (input: { title: string; url: string; icon?: string }) => QuickAccessItem
  'quickAccess.update': (id: string, patch: { title?: string; url?: string; icon?: string }) => QuickAccessItem | null
  'quickAccess.remove': (id: string) => void
  'quickAccess.reorder': (orderedIds: string[]) => void
  'quickAccess.reset': () => QuickAccessItem[]
  'privacy.stats': () => PrivacyStats
  'security.status': () => SecurityStatus
  'threats.status': () => ThreatListStatus
  'threats.update': () => ThreatListStatus
  'update.status': () => UpdateStatus
  'update.check': () => UpdateStatus
  /** `current` is required when a password is already set. `next: null` removes the password. */
  'security.setPassword': (current: string, next: string | null) => SecurityStatus
  'favicons.forHosts': (hosts: string[]) => Record<string, string>
  'downloads.list': () => DownloadRecord[]
  'downloads.pause': (id: string) => void
  'downloads.resume': (id: string) => void
  'downloads.cancel': (id: string) => void
  'downloads.retry': (id: string) => void
  'downloads.open': (id: string) => Promise<string>
  'downloads.show': (id: string) => void
  'downloads.remove': (id: string) => void
  'downloads.clearFinished': () => void

  // ── internal pages only ───────────────────────────────────────────────
  'page.env': () => AppEnv
  'page.navigate': (input: string, opts?: { newTab?: boolean }) => void
  'page.proceedCertificate': (url: string) => void
  'page.allowHttp': (url: string) => void
  'page.allowThreat': (url: string) => void
  'settings.pickDownloadFolder': () => Promise<string | null>
  'settings.pickBackground': () => Promise<string | null>
  'settings.clearBackground': () => void
  'privacy.clear': (options: ClearDataOptions) => Promise<void>
  'bookmarks.import': () => Promise<number>
  'bookmarks.export': () => Promise<boolean>
  'app.restart': () => void
}

export type RpcMethod = keyof RpcMethods

export interface EventMap {
  'shell:state': ShellState
  'shell:focus-omnibox': undefined
  'shell:bookmark-popup': undefined
  'shell:open-downloads': undefined
  'shell:show-menu': { menuId: number; x: number; y: number; items: OverlayMenuItem[] }
  'shell:find': undefined
  'shell:find-result': FindState
  'settings:changed': Settings
  'history:changed': undefined
  'bookmarks:changed': undefined
  'quickAccess:changed': undefined
  'downloads:upsert': DownloadRecord
  'downloads:remove': string
  'downloads:reset': undefined
}

export type EventName = keyof EventMap

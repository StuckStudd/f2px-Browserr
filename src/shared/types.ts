/** Data models shared by the main process, preloads and renderers. */

export type SearchEngineId = 'google' | 'bing' | 'duckduckgo' | 'brave'
export type ThemeMode = 'dark' | 'light' | 'system'
export type AccentMode = 'white' | 'gray' | 'custom'
export type StartupBehavior = 'home' | 'restore'
export type DownloadMode = 'default' | 'ask' | 'custom'
export type TrackerBlocking = 'off' | 'standard' | 'strict'
export type SecureDnsMode = 'off' | 'automatic' | 'strict'
export type DnsProvider = 'cloudflare' | 'quad9' | 'mullvad' | 'custom'
export type VaultMode = 'dpapi' | 'password' | 'plain'

export interface Settings {
  /** False until the first-run welcome wizard has been completed. */
  onboarded: boolean
  // general
  searchEngine: SearchEngineId
  startupBehavior: StartupBehavior
  /** Empty string means the built-in F2PX start page. */
  homeUrl: string
  // start page
  quickAccessEnabled: boolean
  showClock: boolean
  clock24h: boolean
  showGreeting: boolean
  userName: string
  background: 'default' | 'custom'
  /** File name inside the user-data backgrounds folder. */
  backgroundImage: string | null
  // appearance
  theme: ThemeMode
  accent: AccentMode
  accentCustom: string
  animations: boolean
  compactMode: boolean
  showBookmarksBar: boolean
  // privacy
  /** Report Chrome's Client Hints / window.chrome so sites like Google sign-in accept the browser (new tabs). */
  chromeCompat: boolean
  /** Blocks third-party requests to known ad / analytics / tracking hosts. */
  trackerBlocking: TrackerBlocking
  /** Upgrades http:// page loads to https:// and warns when a site has no secure version. */
  httpsOnly: boolean
  /** Blocks known malware / phishing sites and warns about look-alike addresses. */
  threatProtection: boolean
  /** Download fresh malware / phishing lists once a day (contacts abuse.ch and GitHub). Off by default. */
  protectionUpdates: boolean
  /** Ask the update feed whether a newer F2PX exists (notification only, nothing is installed). Off by default. */
  checkUpdates: boolean
  /** Removes utm_*, fbclid, gclid… from links you open. */
  stripTrackingParams: boolean
  /** DNS-over-HTTPS: encrypts the lookup of every site name. */
  secureDns: SecureDnsMode
  dnsProvider: DnsProvider
  dnsCustomUrl: string
  doNotTrack: boolean
  searchSuggestions: boolean
  /** Spell check downloads dictionaries from Google servers on Windows, so it is opt-in. */
  spellcheck: boolean
  clearCookiesOnExit: boolean
  clearHistoryOnExit: boolean
  // downloads
  downloadMode: DownloadMode
  downloadPath: string
  downloadNotifications: boolean
  // system
  startWithWindows: boolean
  minimizeToTray: boolean
  hardwareAcceleration: boolean
}

export type TabSecurity = 'secure' | 'insecure' | 'internal' | 'local' | 'error'

export interface TabInfo {
  id: number
  url: string
  /** What the address bar shows (empty for the start page, original URL for error pages). */
  displayUrl: string
  title: string
  favicon: string | null
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  pinned: boolean
  audible: boolean
  muted: boolean
  security: TabSecurity
  /** Trackers blocked on the current page. */
  blocked: number
}

export interface ShellState {
  tabs: TabInfo[]
  activeId: number | null
  isPrivate: boolean
  isMaximized: boolean
  isFullscreen: boolean
  bookmarked: boolean
  canReopenTab: boolean
  zoomPercent: number
}

export interface Bookmark {
  id: string
  parentId: string | null
  type: 'bookmark' | 'folder'
  title: string
  url: string
  favicon: string | null
  position: number
  createdAt: number
}

export interface HistoryEntry {
  id: number
  url: string
  title: string
  favicon: string | null
  visitedAt: number
}

export interface QuickAccessItem {
  id: string
  title: string
  url: string
  /** '' = automatic, `text:AB` = custom monogram, otherwise an image URL / data URL. */
  icon: string
  position: number
}

export type DownloadState = 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled'

export interface DownloadRecord {
  id: string
  url: string
  /** Page that initiated the download. */
  source: string
  filename: string
  savePath: string
  totalBytes: number
  receivedBytes: number
  /** Bytes per second, smoothed. Only meaningful while downloading. */
  speed: number
  state: DownloadState
  mime: string
  startedAt: number
  endedAt: number | null
  error: string | null
  isPrivate: boolean
}

export type SuggestionKind = 'action' | 'bookmark' | 'history' | 'top' | 'search'

export interface Suggestion {
  kind: SuggestionKind
  /** Text shown as the primary line. */
  title: string
  /** URL to open, or the search text for `search`/`action` suggestions. */
  value: string
  /** Secondary line (URL / hint). */
  detail: string
  favicon: string | null
}

export interface HistoryQuery {
  query?: string
  limit?: number
  offset?: number
}

export interface ClearDataOptions {
  history?: boolean
  downloads?: boolean
  cookies?: boolean
  cache?: boolean
}

export interface OverlayMenuItem {
  id: string
  label: string
  shortcut?: string
  disabled?: boolean
  separator?: boolean
}

export interface PrivacyStats {
  blockedTotal: number
}

export interface ThreatListStatus {
  entries: number
  source: 'bundled' | 'updated'
  updatedAt: string | null
}

export interface UpdateStatus {
  state: 'unconfigured' | 'idle' | 'uptodate' | 'available' | 'error'
  current: string
  latest?: string
  url?: string
  notes?: string
  checkedAt?: string
  error?: string
}

export interface SecurityStatus {
  /** Whether local data is encrypted at rest. */
  encrypted: boolean
  mode: VaultMode
}

export interface AppEnv {
  isPrivate: boolean
  version: string
  platform: string
}

export interface FindState {
  active: number
  total: number
}

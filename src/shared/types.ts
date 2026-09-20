/** Data models shared by the main process, preloads and renderers. */

export type SearchEngineId = 'duckduckgo' | 'brave' | 'startpage' | 'qwant' | 'mojeek' | 'google' | 'bing'
export type ThemeMode = 'dark' | 'light' | 'system'
export type AccentMode = 'white' | 'gray' | 'custom'
export type StartupBehavior = 'home' | 'restore'
export type DownloadMode = 'default' | 'ask' | 'custom'
export type TrackerBlocking = 'off' | 'standard' | 'strict'
export type SecureDnsMode = 'off' | 'automatic' | 'strict'
export type DnsProvider = 'cloudflare' | 'quad9' | 'mullvad' | 'custom'
export type VaultMode = 'dpapi' | 'password' | 'plain'
/** A named bundle of privacy settings. `custom` means the current settings match none of the bundles. */
export type PrivacyLevel = 'standard' | 'strict' | 'anonymous' | 'custom'
export type FingerprintLevel = 'off' | 'standard' | 'strict'
/** `public`: only the public network interface is exposed to WebRTC. `proxy-only`: no direct UDP at all. */
export type WebRtcPolicy = 'public' | 'proxy-only'
/** How the browser reaches the network. `tor` sends everything through a local Tor client and never falls back to a direct connection. */
export type ProxyMode = 'system' | 'direct' | 'custom' | 'tor'

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
  /** Blocks ads and trackers with filter lists (EasyList / EasyPrivacy / uBlock filters format). */
  adBlocking: boolean
  /** Hides ad placeholders and banners that the filter lists describe (element hiding). */
  cosmeticFiltering: boolean
  /** Makes canvas / audio / WebGL / hardware / screen / time-zone fingerprints useless for cross-site tracking. */
  fingerprintProtection: FingerprintLevel
  /** Strips cookies from third-party requests and responses (per-site exceptions are possible). */
  blockThirdPartyCookies: boolean
  /** Sends no Referer header on cross-site requests. */
  stripCrossSiteReferrer: boolean
  webrtcPolicy: WebRtcPolicy
  proxyMode: ProxyMode
  /** Proxy used when `proxyMode` is `custom`: http://host:port or socks5://host:port. */
  proxyUrl: string
  /** Empty = detect a running Tor (Tor Browser 9150, Tor daemon 9050) or start the client at `torPath`. */
  torProxyUrl: string
  /** Optional path to tor.exe (Tor Expert Bundle); F2PX starts and stops it for you. */
  torPath: string
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

/** Per-page counters of what the privacy shield did. */
export interface PageReport {
  trackers: number
  ads: number
  cookies: number
  referrers: number
  fingerprint: number
  pings: number
  threats: number
  upgrades: number
}

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
  /** Ads + trackers blocked on the current page. */
  blocked: number
  /** Fingerprinting attempts neutralised on the current page. */
  fingerprint: number
  /** False when the user switched the shield off for this site. */
  shieldsUp: boolean
}

export interface ShellState {
  tabs: TabInfo[]
  activeId: number | null
  isPrivate: boolean
  /** The window sends all traffic through Tor. */
  isTor: boolean
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
  /** Lifetime counters (survive restarts). */
  total: PageReport
  /** Since this run of the browser started. */
  session: PageReport
}

export interface FilterListStatus {
  /** Network rules that block or allow requests. */
  networkRules: number
  /** Element-hiding rules (selectors). */
  cosmeticRules: number
  ready: boolean
  source: 'bundled' | 'updated'
  updatedAt: string | null
}

/** What the shield knows about one site (registrable domain) — the state behind the site-info popup. */
export interface SiteInfo {
  /** Registrable domain the exceptions apply to. */
  site: string
  host: string
  origin: string
  shieldsUp: boolean
  allowThirdPartyCookies: boolean
  /** Tor windows always run the strictest shield; exceptions cannot be made there. */
  locked: boolean
  report: PageReport
  permissions: SitePermission[]
}

export interface SitePermission {
  origin: string
  permission: string
  decision: 'allow' | 'block'
}

export interface NetStatus {
  mode: ProxyMode
  /** What is actually in use right now for regular windows. */
  route: 'direct' | 'system' | 'custom' | 'tor'
  /** Proxy address in use (custom / Tor), empty for direct / system. */
  proxy: string
  tor: { reachable: boolean; managed: boolean; running: boolean; proxy: string; error: string | null }
}

export interface FireOptions {
  tabs: boolean
  history: boolean
  downloads: boolean
  cookies: boolean
  cache: boolean
  permissions: boolean
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
  isTor: boolean
  version: string
  platform: string
}

export interface FindState {
  active: number
  total: number
}

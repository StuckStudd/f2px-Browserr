import type { SearchEngineId, Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  searchEngine: 'duckduckgo',
  startupBehavior: 'home',
  homeUrl: '',
  quickAccessEnabled: true,
  showClock: true,
  clock24h: true,
  showGreeting: true,
  userName: '',
  background: 'default',
  backgroundImage: null,
  theme: 'dark',
  accent: 'white',
  accentCustom: '#7dd3fc',
  animations: true,
  compactMode: false,
  showBookmarksBar: false,
  chromeCompat: true,
  trackerBlocking: 'standard',
  httpsOnly: true,
  threatProtection: true,
  protectionUpdates: false,
  checkUpdates: false,
  stripTrackingParams: true,
  secureDns: 'automatic',
  dnsProvider: 'quad9',
  dnsCustomUrl: '',
  doNotTrack: true,
  searchSuggestions: false,
  spellcheck: false,
  clearCookiesOnExit: false,
  clearHistoryOnExit: false,
  downloadMode: 'default',
  downloadPath: '',
  downloadNotifications: true,
  startWithWindows: false,
  minimizeToTray: false,
  hardwareAcceleration: true
}

export interface SearchEngine {
  id: SearchEngineId
  name: string
  /** `%s` is replaced with the encoded query. */
  searchUrl: string
  suggestUrl: string
}

export const SEARCH_ENGINES: Record<SearchEngineId, SearchEngine> = {
  google: {
    id: 'google',
    name: 'Google',
    searchUrl: 'https://www.google.com/search?q=%s',
    suggestUrl: 'https://suggestqueries.google.com/complete/search?client=firefox&q=%s'
  },
  bing: {
    id: 'bing',
    name: 'Bing',
    searchUrl: 'https://www.bing.com/search?q=%s',
    suggestUrl: 'https://api.bing.com/osjson.aspx?query=%s'
  },
  duckduckgo: {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    searchUrl: 'https://duckduckgo.com/?q=%s',
    suggestUrl: 'https://duckduckgo.com/ac/?type=list&q=%s'
  },
  brave: {
    id: 'brave',
    name: 'Brave Search',
    searchUrl: 'https://search.brave.com/search?q=%s',
    suggestUrl: 'https://search.brave.com/api/suggest?q=%s'
  }
}

export const SEARCH_ENGINE_LIST = Object.values(SEARCH_ENGINES)

/** DNS-over-HTTPS resolvers offered in Settings (URL templates). */
export const DNS_PROVIDERS = {
  cloudflare: { name: 'Cloudflare (1.1.1.1)', url: 'https://cloudflare-dns.com/dns-query' },
  quad9: { name: 'Quad9 (blocks malware & phishing)', url: 'https://dns.quad9.net/dns-query' },
  mullvad: { name: 'Mullvad (no logging)', url: 'https://dns.mullvad.net/dns-query' }
} as const

/** Height of the find-in-page row (px). */
export const FIND_BAR_HEIGHT = 34

/** Heights of the browser chrome strips (px). Shared so main and renderer agree. */
export function chromeLayout(settings: Pick<Settings, 'compactMode' | 'showBookmarksBar'>) {
  const compact = settings.compactMode
  const tabs = compact ? 32 : 38
  const toolbar = compact ? 36 : 42
  const bookmarks = settings.showBookmarksBar ? (compact ? 26 : 30) : 0
  return { tabs, toolbar, bookmarks, total: tabs + toolbar + bookmarks }
}

export const DEFAULT_QUICK_ACCESS: ReadonlyArray<{ title: string; url: string }> = [
  { title: 'YouTube', url: 'https://www.youtube.com/' },
  { title: 'Gmail', url: 'https://mail.google.com/' },
  { title: 'Google', url: 'https://www.google.com/' },
  { title: 'GitHub', url: 'https://github.com/' },
  { title: 'ChatGPT', url: 'https://chatgpt.com/' },
  { title: 'Reddit', url: 'https://www.reddit.com/' },
  { title: 'X', url: 'https://x.com/' },
  { title: 'Discord', url: 'https://discord.com/app' }
]

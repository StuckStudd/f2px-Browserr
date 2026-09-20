import { SEARCH_ENGINES } from './settings'
import type { SearchEngineId } from './types'

export const INTERNAL_SCHEME = 'f2px'
export const HOME_URL = `${INTERNAL_SCHEME}://home`

export type InternalPage = 'home' | 'history' | 'downloads' | 'bookmarks' | 'settings' | 'privacy' | 'error' | 'welcome' | 'unlock'
export const INTERNAL_PAGES: readonly InternalPage[] = [
  'home',
  'history',
  'downloads',
  'bookmarks',
  'settings',
  'privacy',
  'error',
  'welcome',
  'unlock'
]

export function isInternalUrl(url: string): boolean {
  return url.startsWith(`${INTERNAL_SCHEME}://`)
}

export function internalPageOf(url: string): InternalPage | null {
  if (!isInternalUrl(url)) return null
  try {
    const host = new URL(url).hostname
    if (host === 'newtab') return 'home'
    return (INTERNAL_PAGES as readonly string[]).includes(host) ? (host as InternalPage) : null
  } catch {
    return null
  }
}

export type ErrorKind = 'connection' | 'dns' | 'offline' | 'crash' | 'certificate' | 'httpsonly' | 'threat' | 'proxy' | 'generic'

export function errorPageUrl(kind: ErrorKind, url: string, code?: number, detail?: string): string {
  const params = new URLSearchParams({ type: kind, url })
  if (code !== undefined) params.set('code', String(code))
  if (detail) params.set('detail', detail)
  return `${INTERNAL_SCHEME}://error?${params.toString()}`
}

/** What the address bar should display for a given tab URL. */
export function displayUrlFor(url: string): string {
  if (!url || url === 'about:blank') return ''
  const page = internalPageOf(url)
  if (page === 'home') return ''
  if (page === 'error') {
    try {
      return new URL(url).searchParams.get('url') ?? ''
    } catch {
      return ''
    }
  }
  return url
}

const HOST_LIKE =
  /^(localhost|(\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]+\]|([a-z0-9¡-￿]([a-z0-9¡-￿-]*[a-z0-9¡-￿])?\.)+[a-z¡-￿]{2,})(:\d{1,5})?([/?#]\S*)?$/i
const HOST_PORT = /^[^\s/:]+:\d{1,5}([/?#]\S*)?$/
const LOCAL_HOST = /^(localhost|(\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]+\])(:\d+)?([/?#]|$)/i
const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'file:', 'f2px:'])

export type ResolvedInput = { kind: 'url' | 'search'; url: string; query?: string }

export function searchUrlFor(engine: SearchEngineId, query: string): string {
  return SEARCH_ENGINES[engine].searchUrl.replace('%s', encodeURIComponent(query))
}

/** Omnibox rules: real URL -> open it, anything else -> search with the chosen engine. */
export function resolveInput(input: string, engine: SearchEngineId): ResolvedInput | null {
  const text = input.trim()
  if (!text) return null

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(text)
  if (scheme && !HOST_PORT.test(text)) {
    try {
      const parsed = new URL(text)
      if (ALLOWED_SCHEMES.has(parsed.protocol)) return { kind: 'url', url: parsed.toString() }
    } catch {
      /* fall through to search */
    }
    if (text.toLowerCase() === 'about:blank') return { kind: 'url', url: HOME_URL }
    return { kind: 'search', url: searchUrlFor(engine, text), query: text }
  }

  if (!/\s/.test(text) && HOST_LIKE.test(text)) {
    const protocol = LOCAL_HOST.test(text) ? 'http' : 'https'
    try {
      return { kind: 'url', url: new URL(`${protocol}://${text}`).toString() }
    } catch {
      /* fall through */
    }
  }
  return { kind: 'search', url: searchUrlFor(engine, text), query: text }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function originOf(url: string): string {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : ''
  } catch {
    return ''
  }
}

/** Only http(s) URLs may be stored as bookmarks / quick-access entries. */
export function isWebUrl(url: string): boolean {
  try {
    const p = new URL(url).protocol
    return p === 'http:' || p === 'https:'
  } catch {
    return false
  }
}

/** Normalises user-typed URLs for quick access / bookmarks (adds https:// when missing). */
export function normalizeWebUrl(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`
  try {
    const u = new URL(candidate)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

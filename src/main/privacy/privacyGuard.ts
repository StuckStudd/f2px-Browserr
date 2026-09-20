import type {
  OnBeforeRequestListenerDetails,
  OnBeforeSendHeadersListenerDetails,
  OnHeadersReceivedListenerDetails,
  Session
} from 'electron'
import type { PageReport } from '../../shared/types'
import { hostOf, isInternalUrl } from '../../shared/url'
import type { SettingsService } from '../settings/settingsService'
import type { Database } from '../storage/database'

import { PrivacyCounters } from './counters'
import { typeOfResource } from './filterEngine'
import type { FilterLists } from './filterLists'
import { isLocalHost, isThirdParty } from './hosts'
import { checkLookalike, type LookalikeReason } from './lookalike'
import { policyFor, type Policy, type SessionKind } from './policy'
import { SiteRules } from './siteRules'
import type { ThreatList } from './threatList'
import { STRICT_TRACKER_HOSTS, TRACKER_HOSTS, TRACKER_PATHS } from './trackerList'

/** Query parameters that only exist to follow you from link to link. */
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'utm_name', 'utm_reader',
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'yclid', '_openstat', 'twclid', 'igshid',
  'mc_eid', 'mc_cid', 'ttclid', 'li_fat_id', 'vero_id', 'ref_src', 'ref_url', 'srsltid'
])

export function stripTrackingParams(url: URL): URL | null {
  let changed = false
  const cleaned = new URL(url.href)
  for (const key of [...cleaned.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      cleaned.searchParams.delete(key)
      changed = true
    }
  }
  return changed ? cleaned : null
}
const UPGRADE_TTL_MS = 120_000

/** Hints a site can ask for (via Accept-CH) that describe your hardware and software in detail. */
const HIGH_ENTROPY_HINT = /^sec-ch-ua-(?:full-version|full-version-list|platform-version|arch|bitness|model|wow64|form-factors)$|^sec-ch-(?:device-memory|dpr|viewport-width|width|prefers-|ect|downlink|rtt|save-data)/i

interface PageContext {
  /** Top-level page address ('' when unknown, e.g. service workers). */
  pageUrl: string
  pageHost: string
}

/**
 * Network-level privacy policy for tab sessions:
 *  - blocks malware / phishing pages and sub-resources;
 *  - blocks ads and trackers (filter lists + a built-in host list), third-party beacons and CSP reports;
 *  - strips third-party cookies and cross-site Referer headers;
 *  - upgrades http:// page loads to https:// (unless the site is local or the user chose to continue).
 * Per-site exceptions and Tor windows are honoured through `policyFor`.
 */
export class PrivacyGuard {
  private readonly trackers = new Set(TRACKER_HOSTS)
  private readonly strictTrackers = new Set(STRICT_TRACKER_HOSTS)
  private readonly allowedHttpHosts = new Set<string>()
  private readonly upgrades = new Map<string, { original: string; at: number }>()
  private readonly attached = new WeakMap<Session, SessionKind>()
  private readonly allowedThreatHosts = new Set<string>()
  private readonly threatPages = new Map<string, { reason: string; at: number }>()
  readonly counters: PrivacyCounters
  /** Called for everything the shield does, with the id of the webContents it happened in. */
  onEvent: (kind: keyof PageReport, webContentsId: number | undefined) => void = () => {}
  /** Set by the app: has this host been visited before? */
  hasVisited: (host: string) => boolean = () => false

  constructor(
    db: Database,
    private readonly settings: SettingsService,
    readonly threats: ThreatList,
    readonly lists: FilterLists,
    readonly sites: SiteRules
  ) {
    this.counters = new PrivacyCounters(db)
  }

  stats(): { blockedTotal: number; total: PageReport; session: PageReport } {
    return { blockedTotal: this.counters.blockedTotal(), total: { ...this.counters.total }, session: { ...this.counters.session } }
  }

  flush(): void {
    this.counters.flush()
  }

  /** Is this one of the sessions our browser windows use? (The shell's own session is not.) */
  hasSession(ses: Session): boolean {
    return this.attached.has(ses)
  }

  kindOf(ses: Session): SessionKind {
    return this.attached.get(ses) ?? 'normal'
  }

  /** Effective policy for a page on `host` in a session of `kind`, after the user's per-site exceptions. */
  policyForPage(kind: SessionKind, host: string): Policy & { shieldsUp: boolean } {
    const base = policyFor(this.settings.get(), kind)
    const shieldsUp = !(base.allowExceptions && host && this.sites.shieldsOff(host))
    if (!shieldsUp) {
      return {
        ...base,
        shieldsUp,
        trackers: 'off',
        ads: false,
        cosmetic: false,
        fingerprint: 'off',
        blockThirdPartyCookies: false,
        stripReferrer: false
      }
    }
    const cookies = base.blockThirdPartyCookies && !(base.allowExceptions && host && this.sites.cookiesAllowed(host))
    return { ...base, shieldsUp, blockThirdPartyCookies: cookies }
  }

  attach(ses: Session, kind: SessionKind): void {
    if (this.attached.has(ses)) return
    this.attached.set(ses, kind)

    ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
      const run = (): void => {
        try {
          callback(this.decide(details, kind))
        } catch {
          callback({})
        }
      }
      // Requests wait (briefly) for the filter lists on the very first page load instead of slipping through.
      if (this.lists.ready) run()
      else void this.lists.whenReady().then(run)
    })

    ses.webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
      try {
        callback(this.rewriteRequestHeaders(details, kind))
      } catch {
        callback({})
      }
    })

    ses.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      try {
        callback(this.rewriteResponseHeaders(details, kind))
      } catch {
        callback({})
      }
    })
  }

  // ── page context ─────────────────────────────────────────────────────────
  private pageOf(details: { webContents?: { getURL(): string; isDestroyed(): boolean } | null; url: string; resourceType: string }): PageContext {
    if (details.resourceType === 'mainFrame') return { pageUrl: details.url, pageHost: hostOf(details.url) }
    const wc = details.webContents
    const pageUrl = wc && !wc.isDestroyed() ? wc.getURL() : ''
    return { pageUrl, pageHost: hostOf(pageUrl) }
  }

  private event(kind: keyof PageReport, webContentsId: number | undefined): void {
    this.counters.add(kind)
    this.onEvent(kind, webContentsId)
  }

  /** A fingerprinting attempt neutralised by the page shield (reported by the frame preload). */
  fingerprintBlocked(webContentsId: number | undefined): void {
    this.event('fingerprint', webContentsId)
  }

  // ── requests ─────────────────────────────────────────────────────────────
  private decide(details: OnBeforeRequestListenerDetails, kind: SessionKind): { cancel?: boolean; redirectURL?: string } {
    let url: URL
    try {
      url = new URL(details.url)
    } catch {
      return {}
    }
    const s = this.settings.get()

    // Malware / phishing: known-bad sites and deceptive addresses never load without an explicit decision.
    if (s.threatProtection && details.resourceType === 'mainFrame' && (url.protocol === 'http:' || url.protocol === 'https:')) {
      const host = url.hostname.toLowerCase()
      if (!this.allowedThreatHosts.has(host) && !isLocalHost(host)) {
        let reason: string | null = null
        if (this.threats.has(host)) reason = 'listed'
        else {
          const look: LookalikeReason | null = checkLookalike(host)
          if (look && !this.hasVisited(host)) reason = look.kind === 'idn' ? 'idn' : `lookalike:${look.brand}`
        }
        if (reason) {
          this.rememberThreat(url.href, reason)
          this.event('threats', details.webContentsId)
          return { cancel: true }
        }
      }
    }

    // HTTPS-only: page loads only. Sub-resources on http pages are the site's own business.
    if (details.resourceType === 'mainFrame') {
      if (s.httpsOnly && url.protocol === 'http:' && !isLocalHost(url.hostname) && !this.allowedHttpHosts.has(url.hostname)) {
        const secure = new URL(url.href)
        secure.protocol = 'https:'
        this.rememberUpgrade(secure.href, details.url)
        this.event('upgrades', details.webContentsId)
        return { redirectURL: secure.href }
      }
      if (s.stripTrackingParams && details.method === 'GET' && url.search) {
        const cleaned = stripTrackingParams(url)
        if (cleaned) return { redirectURL: cleaned.href }
      }
      return {}
    }

    // Sub-resources from known malware / phishing hosts are dropped whichever site asks for them.
    if (s.threatProtection && this.threats.has(url.hostname)) {
      this.event('threats', details.webContentsId)
      return { cancel: true }
    }

    const page = this.pageOf(details)
    if (!page.pageUrl || isInternalUrl(page.pageUrl) || !page.pageHost) return {}
    const policy = this.policyForPage(kind, page.pageHost)
    if (policy.trackers === 'off' && !policy.ads) return {}

    const host = url.hostname.toLowerCase()
    const thirdParty = isThirdParty(host, page.pageHost)
    if (!thirdParty && !policy.ads) return {}

    // A public website reaching into your own machine or home network is a known tracking / port-scanning trick.
    if (policy.trackers === 'strict' && isLocalHost(host) && !isLocalHost(page.pageHost)) {
      this.event('trackers', details.webContentsId)
      return { cancel: true }
    }

    // Third-party beacons and CSP reports carry data to someone you never visited.
    if (thirdParty && policy.trackers !== 'off' && (details.resourceType === 'ping' || details.resourceType === 'cspReport')) {
      this.event('pings', details.webContentsId)
      return { cancel: true }
    }

    if (policy.ads) {
      const engine = this.lists.engine
      const pageHost = page.pageHost.toLowerCase()
      if (!engine.isPageAllowed(page.pageUrl, pageHost)) {
        const verdict = engine.match({ url: details.url, host, type: typeOfResource(details.resourceType), pageHost, thirdParty })
        if (verdict === 'block') {
          this.event(engine.lastTag === 2 ? 'trackers' : 'ads', details.webContentsId)
          return { cancel: true }
        }
        if (verdict === 'allow') return {}
      }
    }

    if (policy.trackers !== 'off' && thirdParty && this.isTracker(url, policy.trackers === 'strict')) {
      this.event('trackers', details.webContentsId)
      return { cancel: true }
    }
    return {}
  }

  private isTracker(url: URL, strict: boolean): boolean {
    const host = url.hostname.toLowerCase()
    // walk up the labels: a.b.tracker.com -> b.tracker.com -> tracker.com
    for (let h = host; h.includes('.'); h = h.slice(h.indexOf('.') + 1)) {
      if (this.trackers.has(h) || (strict && this.strictTrackers.has(h))) return true
    }
    return TRACKER_PATHS.some((r) => r.host === host && url.pathname.startsWith(r.prefix))
  }

  // ── headers ──────────────────────────────────────────────────────────────
  private rewriteRequestHeaders(details: OnBeforeSendHeadersListenerDetails, kind: SessionKind): { requestHeaders?: Record<string, string | string[]> } {
    const page = this.pageOf(details)
    // Our own pages and requests without a page (workers, favicon fetches) are left alone.
    if (isInternalUrl(page.pageUrl) || isInternalUrl(details.url)) return {}
    const policy = this.policyForPage(kind, page.pageHost)
    const headers: Record<string, string | string[]> = { ...details.requestHeaders }
    let changed = false
    const drop = (name: string): boolean => {
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === name.toLowerCase()) {
          delete headers[key]
          changed = true
          return true
        }
      }
      return false
    }

    if (policy.sendDnt) {
      headers['DNT'] = '1'
      headers['Sec-GPC'] = '1'
      changed = true
    }

    let host = ''
    try {
      host = new URL(details.url).hostname
    } catch {
      /* keep empty */
    }
    const crossSite = details.resourceType !== 'mainFrame' && !!page.pageHost && !!host && isThirdParty(host, page.pageHost)

    if (policy.blockThirdPartyCookies && crossSite && drop('Cookie')) this.event('cookies', details.webContentsId)

    if (policy.stripReferrer) {
      const referrer = details.referrer || (headers['Referer'] as string | undefined) || ''
      const source = hostOf(referrer)
      if (referrer && host && source && isThirdParty(host, source)) {
        if (drop('Referer')) this.event('referrers', details.webContentsId)
      }
    }

    if (policy.fingerprint === 'strict') {
      for (const key of Object.keys(headers)) {
        if (HIGH_ENTROPY_HINT.test(key)) {
          delete headers[key]
          changed = true
        }
      }
    }
    return changed ? { requestHeaders: headers } : {}
  }

  private rewriteResponseHeaders(
    details: OnHeadersReceivedListenerDetails,
    kind: SessionKind
  ): { responseHeaders?: Record<string, string[]> } {
    const page = this.pageOf(details)
    if (isInternalUrl(page.pageUrl) || isInternalUrl(details.url) || !details.responseHeaders) return {}
    const policy = this.policyForPage(kind, page.pageHost)
    let host = ''
    try {
      host = new URL(details.url).hostname
    } catch {
      /* keep empty */
    }
    const crossSite = details.resourceType !== 'mainFrame' && !!page.pageHost && !!host && isThirdParty(host, page.pageHost)
    const headers: Record<string, string[]> = { ...details.responseHeaders }
    let changed = false
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase()
      if (policy.blockThirdPartyCookies && crossSite && lower === 'set-cookie') {
        delete headers[key]
        changed = true
        this.event('cookies', details.webContentsId)
      } else if (policy.fingerprint === 'strict' && (lower === 'accept-ch' || lower === 'critical-ch')) {
        // Without these a site never learns more than the basic, low-entropy hints.
        delete headers[key]
        changed = true
      }
    }
    return changed ? { responseHeaders: headers } : {}
  }

  // ── HTTPS-only bookkeeping ─────────────────────────────────────────────
  private rememberUpgrade(secureUrl: string, original: string): void {
    const now = Date.now()
    for (const [key, value] of this.upgrades) if (now - value.at > UPGRADE_TTL_MS) this.upgrades.delete(key)
    this.upgrades.set(secureUrl, { original, at: now })
  }

  /** If `failedUrl` was an https:// URL we substituted for an http:// one, returns the original http URL. */
  consumeUpgrade(failedUrl: string): string | null {
    const entry = this.upgrades.get(failedUrl)
    if (!entry) return null
    this.upgrades.delete(failedUrl)
    return Date.now() - entry.at <= UPGRADE_TTL_MS ? entry.original : null
  }

  // ── threat pages ─────────────────────────────────────────────────────────
  private rememberThreat(url: string, reason: string): void {
    const now = Date.now()
    for (const [key, value] of this.threatPages) if (now - value.at > UPGRADE_TTL_MS) this.threatPages.delete(key)
    this.threatPages.set(url, { reason, at: now })
  }

  /** If the navigation to `blockedUrl` was stopped by threat protection, returns why. */
  consumeThreat(blockedUrl: string): string | null {
    const entry = this.threatPages.get(blockedUrl)
    if (!entry) return null
    this.threatPages.delete(blockedUrl)
    return entry.reason
  }

  /** The user chose "continue anyway" for this host (kept until the app closes). */
  allowThreat(url: string): void {
    try {
      this.allowedThreatHosts.add(new URL(url).hostname.toLowerCase())
    } catch {
      /* ignore */
    }
  }

  /** The user chose "continue to HTTP" for this host (kept until the app closes). */
  allowHttp(url: string): void {
    try {
      this.allowedHttpHosts.add(new URL(url).hostname)
    } catch {
      /* ignore */
    }
  }
}

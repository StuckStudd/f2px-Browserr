import type { OnBeforeRequestListenerDetails, Session } from 'electron'
import { isInternalUrl } from '../../shared/url'
import type { SettingsService } from '../settings/settingsService'
import type { Database } from '../storage/database'
import { isLocalHost, isThirdParty } from './hosts'
import { checkLookalike, type LookalikeReason } from './lookalike'
import type { ThreatList } from './threatList'
import { STRICT_TRACKER_HOSTS, TRACKER_HOSTS, TRACKER_PATHS } from './trackerList'

const STATS_KEY = 'blockedTotal'

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

/**
 * Network-level privacy policy for tab sessions:
 *  - blocks third-party requests to known tracking hosts and counts them;
 *  - upgrades http:// page loads to https:// (unless the site is local or the user chose to continue).
 */
export class PrivacyGuard {
  private readonly trackers = new Set(TRACKER_HOSTS)
  private readonly strictTrackers = new Set(STRICT_TRACKER_HOSTS)
  private readonly allowedHttpHosts = new Set<string>()
  private readonly upgrades = new Map<string, { original: string; at: number }>()
  private readonly attached = new WeakSet<Session>()
  private readonly allowedThreatHosts = new Set<string>()
  private readonly threatPages = new Map<string, { reason: string; at: number }>()
  private blockedTotal: number
  private dirty = false
  /** Called for every blocked request with the id of the webContents that issued it. */
  onBlocked: (webContentsId: number | undefined) => void = () => {}
  /** Set by the app: has this host been visited before? */
  hasVisited: (host: string) => boolean = () => false

  constructor(
    private readonly db: Database,
    private readonly settings: SettingsService,
    readonly threats: ThreatList
  ) {
    this.blockedTotal = db.getKv<number>(STATS_KEY) ?? 0
    const timer = setInterval(() => this.flush(), 10_000)
    timer.unref()
  }

  stats(): { blockedTotal: number } {
    return { blockedTotal: this.blockedTotal }
  }

  flush(): void {
    if (!this.dirty) return
    this.dirty = false
    try {
      this.db.setKv(STATS_KEY, this.blockedTotal)
    } catch {
      /* the counter is cosmetic */
    }
  }

  attach(ses: Session): void {
    if (this.attached.has(ses)) return
    this.attached.add(ses)
    ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      try {
        callback(this.decide(details))
      } catch {
        callback({})
      }
    })
  }

  private decide(details: OnBeforeRequestListenerDetails): { cancel?: boolean; redirectURL?: string } {
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
      this.blockedTotal++
      this.dirty = true
      this.onBlocked(details.webContentsId)
      return { cancel: true }
    }

    if (s.trackerBlocking === 'off') return {}
    const page = details.webContents?.getURL() ?? ''
    if (!page || isInternalUrl(page)) return {}
    let pageHost: string
    try {
      pageHost = new URL(page).hostname
    } catch {
      return {}
    }
    if (!isThirdParty(url.hostname, pageHost)) return {}
    if (!this.isTracker(url, s.trackerBlocking === 'strict')) return {}

    this.blockedTotal++
    this.dirty = true
    this.onBlocked(details.webContentsId)
    return { cancel: true }
  }

  private isTracker(url: URL, strict: boolean): boolean {
    const host = url.hostname.toLowerCase()
    // walk up the labels: a.b.tracker.com -> b.tracker.com -> tracker.com
    for (let h = host; h.includes('.'); h = h.slice(h.indexOf('.') + 1)) {
      if (this.trackers.has(h) || (strict && this.strictTrackers.has(h))) return true
    }
    return TRACKER_PATHS.some((r) => r.host === host && url.pathname.startsWith(r.prefix))
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

import { createHash, randomBytes } from 'node:crypto'
import { ipcMain, type WebContents } from 'electron'
import { hostOf, isInternalUrl } from '../../shared/url'
import { isThirdParty, registrableDomain } from './hosts'
import type { PrivacyGuard } from './privacyGuard'
import type { SessionKind } from './policy'

interface ConfigRequest {
  host: string
  topOrigin: string
  isTop: boolean
}

export interface ShieldReply {
  level: 'off' | 'standard' | 'strict'
  seed: string
  stripReferrer: boolean
  /** This frame is embedded from another site and third-party cookies are blocked: hide `document.cookie` from it. */
  blockCookies: boolean
  css: string
}

const MAX_HITS_PER_PAGE = 64

/**
 * The main-process half of the page shield: tells every frame (through the frame preload) how to protect it, and counts what
 * the shield neutralised. The per-site seed is derived from a secret that lives only in memory — a new browser session, or the
 * "Fire" button, gives every site a new fingerprint identity.
 */
export class ShieldService {
  private secrets = new Map<SessionKind, string>()
  private readonly hits = new Map<number, number>()

  constructor(
    private readonly guard: PrivacyGuard,
    /** True when the webContents belongs to one of our browser windows. */
    private readonly isTab: (contents: WebContents) => boolean
  ) {
    this.rotate()
  }

  /** New fingerprint identity for every site. */
  rotate(): void {
    for (const kind of ['normal', 'private', 'tor'] as const) this.secrets.set(kind, randomBytes(24).toString('hex'))
  }

  register(): void {
    ipcMain.on('f2px:shield-config', (event, request: unknown) => {
      try {
        event.returnValue = this.configFor(event.sender, request)
      } catch {
        event.returnValue = null
      }
    })
    ipcMain.on('f2px:shield-hit', (event) => {
      const contents = event.sender
      if (!this.isTab(contents)) return
      const seen = (this.hits.get(contents.id) ?? 0) + 1
      if (seen > MAX_HITS_PER_PAGE) return
      this.hits.set(contents.id, seen)
      this.guard.fingerprintBlocked(contents.id)
    })
  }

  /** A new top-level page starts counting again. */
  pageStarted(webContentsId: number): void {
    this.hits.delete(webContentsId)
  }

  configFor(sender: WebContents, raw: unknown): ShieldReply | null {
    if (typeof raw !== 'object' || raw === null || !this.isTab(sender)) return null
    const req = raw as Partial<ConfigRequest>
    const host = typeof req.host === 'string' ? req.host.toLowerCase().slice(0, 253) : ''
    const isTop = req.isTop === true
    const pageUrl = sender.getURL()
    if (isInternalUrl(pageUrl)) return null

    // The site the user is on decides the identity: an embedded tracker sees a different one on every site.
    let topHost = ''
    const origin = typeof req.topOrigin === 'string' ? req.topOrigin : ''
    if (origin && origin !== 'null') topHost = hostOf(origin)
    if (!topHost) topHost = hostOf(pageUrl)
    if (!topHost) topHost = host

    const kind = this.guard.kindOf(sender.session)
    const policy = this.guard.policyForPage(kind, topHost)
    const secret = this.secrets.get(kind) ?? ''
    const seed = createHash('sha256').update(`${secret}|${registrableDomain(topHost)}`).digest('hex').slice(0, 32)

    let css = ''
    if (policy.cosmetic && host && /^[a-z0-9.-]+$/.test(host)) {
      css = this.guard.lists.engine.cosmeticCssFor(host, isTop)
    }
    const embedded = !isTop && !!host && isThirdParty(host, topHost)
    return { level: policy.fingerprint, seed, stripReferrer: policy.stripReferrer, blockCookies: policy.blockThirdPartyCookies && embedded, css }
  }
}

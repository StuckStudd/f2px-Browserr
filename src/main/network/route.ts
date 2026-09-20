import type { ProxyConfig, Session } from 'electron'
import type { NetStatus } from '../../shared/types'
import type { SessionKind } from '../privacy/policy'
import type { SettingsService } from '../settings/settingsService'
import { DEAD_PROXY, type TorService } from './torService'

/** What a session is used for: browsing windows, or main-process requests (icons, list updates). */
export type RouteKind = SessionKind | 'net'

/**
 * Decides how each session reaches the internet and keeps it that way: system / direct / a proxy you configured, or Tor.
 * Tor is fail-closed: when no Tor client is reachable the session points at a dead address, so nothing is ever sent directly.
 */
export class NetworkRoute {
  private readonly sessions = new Map<Session, RouteKind>()
  /** Sessions whose proxy we have set explicitly at least once. */
  private readonly touched = new WeakSet<Session>()

  constructor(
    private readonly settings: SettingsService,
    private readonly tor: TorService
  ) {
    settings.onChange.on(({ changed }) => {
      if (changed.some((k) => k === 'proxyMode' || k === 'proxyUrl' || k === 'torProxyUrl' || k === 'torPath')) {
        this.syncTorNeed()
        void this.applyAll()
      }
    })
    tor.onChange.on(() => void this.applyAll())
    this.syncTorNeed()
  }

  private syncTorNeed(): void {
    if (this.settings.get().proxyMode === 'tor' || [...this.sessions.values()].includes('tor')) this.tor.require()
    else this.tor.release()
  }

  /** Registers a session and applies the current route to it. */
  async configure(ses: Session, kind: RouteKind): Promise<void> {
    this.sessions.set(ses, kind)
    if (kind === 'tor') this.tor.require()
    await this.apply(ses, kind)
  }

  /** The proxy configuration for a session — pure, so it can be tested. */
  configFor(kind: RouteKind): ProxyConfig {
    const s = this.settings.get()
    if (kind === 'tor' || s.proxyMode === 'tor') {
      return { mode: 'fixed_servers', proxyRules: this.tor.proxy() ?? DEAD_PROXY, proxyBypassRules: '<-loopback>' }
    }
    if (s.proxyMode === 'custom') {
      // an empty or missing address must not silently mean "direct"
      return { mode: 'fixed_servers', proxyRules: s.proxyUrl || DEAD_PROXY, proxyBypassRules: 'localhost,127.0.0.1,[::1]' }
    }
    if (s.proxyMode === 'direct') return { mode: 'direct' }
    return { mode: 'system' }
  }

  private async apply(ses: Session, kind: RouteKind): Promise<void> {
    try {
      const config = this.configFor(kind)
      // "System" is what a session does by default (and it honours a --proxy-server switch); only undo an earlier override.
      if (config.mode === 'system' && !this.touched.has(ses)) return
      this.touched.add(ses)
      await ses.setProxy(config)
      // connections opened through the old route must not linger
      await ses.closeAllConnections()
    } catch (error) {
      console.error('[route] could not apply the proxy settings', error)
    }
  }

  async applyAll(): Promise<void> {
    await Promise.all([...this.sessions].map(([ses, kind]) => this.apply(ses, kind)))
  }

  /** How regular windows currently reach the network. */
  status(): Omit<NetStatus, 'tor'> {
    const s = this.settings.get()
    const route: NetStatus['route'] = s.proxyMode === 'tor' ? 'tor' : s.proxyMode === 'custom' ? 'custom' : s.proxyMode === 'direct' ? 'direct' : 'system'
    const proxy = s.proxyMode === 'tor' ? (this.tor.proxy() ?? '') : s.proxyMode === 'custom' ? s.proxyUrl : ''
    return { mode: s.proxyMode, route, proxy }
  }
}

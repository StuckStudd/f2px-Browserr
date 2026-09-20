import { BrowserWindow, session, type Session, type WebContents } from 'electron'
import type { FireOptions, PageReport } from '../../shared/types'
import { HOME_URL, resolveInput, type InternalPage } from '../../shared/url'
import type { SessionKind } from '../privacy/policy'
import type { AppServices } from '../services'
import { debounce } from '../utils/emitter'
import { configureSession } from './sessionSetup'
import type { SavedSession, SavedWindow, SessionStore } from './sessionStore'
import { WindowController } from './windowController'

export const NORMAL_PARTITION = 'persist:f2px'
/** No `persist:` prefix -> kept in memory only; shared by all private windows. */
export const PRIVATE_PARTITION = 'f2px-private'
/** Private windows that route everything through Tor. Also in memory only. */
export const TOR_PARTITION = 'f2px-tor'

const PARTITIONS: Record<SessionKind, string> = { normal: NORMAL_PARTITION, private: PRIVATE_PARTITION, tor: TOR_PARTITION }

export interface CreateWindowOptions {
  isPrivate: boolean
  /** A private window whose traffic goes through Tor. */
  tor?: boolean
  url?: string
  state?: SavedWindow
}

export type SenderInfo =
  | { kind: 'shell'; controller: WindowController }
  | { kind: 'page'; controller: WindowController }

export class WindowManager {
  private readonly controllers = new Set<WindowController>()
  private lastFocused: WindowController | null = null
  private quitting = false
  private lastCloseAt = 0
  /** Session writes are paused until this time while several windows are closing together. */
  private frozenUntil = 0
  readonly scheduleSessionSave = debounce(() => this.saveSessionNow(), 800)

  constructor(
    private readonly services: AppServices,
    private readonly sessionStore: SessionStore
  ) {
    services.hub.privacyOf = (contents) => this.ownerOf(contents)?.controller.isPrivate ?? false
    services.downloads.setSessionProvider((isPrivate) => this.sessionFor(isPrivate ? 'private' : 'normal'))
    services.bookmarks.onChange.on(() => this.all().forEach((c) => c.pushState()))
    services.privacy.onEvent = (kind, id) => this.noteEvent(kind, id)
    services.settings.onChange.on(({ changed }) => {
      if (changed.some((k) => k === 'webrtcPolicy' || k === 'fingerprintProtection')) {
        for (const c of this.controllers) c.tabs.forEach((t) => t.applyWebRtcPolicy())
      }
    })
  }

  /** The privacy shield did something in a tab: remember it for the shield popup and the address bar counters. */
  private noteEvent(kind: keyof PageReport, webContentsId: number | undefined): void {
    if (webContentsId === undefined) return
    for (const controller of this.controllers) {
      const tab = controller.tabs.find((t) => t.contents.id === webContentsId)
      if (tab) {
        tab.report[kind]++
        // Ads, trackers and fingerprint attempts drive the address-bar badge; the rest only shows in the popup.
        if (kind === 'trackers' || kind === 'ads' || kind === 'fingerprint') controller.pushState()
        return
      }
    }
  }

  // ── sessions ───────────────────────────────────────────────────────────
  sessionFor(kind: SessionKind): Session {
    const ses = session.fromPartition(PARTITIONS[kind])
    configureSession(
      ses,
      {
        settings: this.services.settings,
        downloads: this.services.downloads,
        privacy: this.services.privacy,
        route: this.services.route,
        parentWindow: (contents) => this.ownerOf(contents)?.controller.window
      },
      kind
    )
    return ses
  }

  // ── windows ────────────────────────────────────────────────────────────
  all(): WindowController[] {
    return [...this.controllers]
  }

  createWindow(options: CreateWindowOptions): WindowController {
    const kind: SessionKind = options.tor ? 'tor' : options.isPrivate ? 'private' : 'normal'
    const controller = new WindowController(this, kind, this.sessionFor(kind), this.services)
    this.controllers.add(controller)
    this.lastFocused = controller

    const anchor = this.all().find((c) => c !== controller && !c.window.isDestroyed())
    if (anchor && !anchor.window.isMaximized()) {
      const [x, y] = anchor.window.getPosition()
      controller.window.setPosition(x + 32, y + 32)
    }

    if (options.state) controller.restore(options.state)
    else controller.createTab({ url: options.url ?? HOME_URL })
    return controller
  }

  /** Opens `url` (or an address typed at the command line) in the most recent regular window. */
  openUrl(input: string): void {
    const resolved = resolveInput(input, this.services.settings.get().searchEngine)
    if (!resolved) return
    const target = this.currentRegularWindow()
    if (target) {
      this.show(target)
      target.createTab({ url: resolved.url })
    } else {
      this.createWindow({ isPrivate: false, url: resolved.url })
    }
  }

  openPage(page: InternalPage): void {
    const target = this.currentRegularWindow() ?? this.createWindow({ isPrivate: false })
    this.show(target)
    target.openInternal(page)
  }

  currentRegularWindow(): WindowController | null {
    if (this.lastFocused && !this.lastFocused.isPrivate && this.controllers.has(this.lastFocused)) return this.lastFocused
    return this.all().find((c) => !c.isPrivate) ?? null
  }

  show(controller: WindowController): void {
    const win = controller.window
    if (win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  showAny(): void {
    const target = this.lastFocused && this.controllers.has(this.lastFocused) ? this.lastFocused : this.all()[0]
    if (target) this.show(target)
    else this.createWindow({ isPrivate: false })
  }

  focused(controller: WindowController): void {
    this.lastFocused = controller
  }

  controllerClosed(controller: WindowController): void {
    this.controllers.delete(controller)
    if (this.lastFocused === controller) this.lastFocused = this.all()[0] ?? null
    // Everything a private (or Tor) session collected disappears together with its last window.
    if (controller.kind !== 'normal' && !this.all().some((c) => c.kind === controller.kind)) this.wipeSession(controller.kind)
    if (controller.kind === 'tor' && !this.all().some((c) => c.kind === 'tor') && this.services.settings.get().proxyMode !== 'tor') {
      this.services.tor.release()
    }
    if (controller.isPrivate && !this.all().some((c) => c.isPrivate)) this.services.downloads.purgePrivate()
    this.scheduleSessionSave()
  }

  private wipeSession(kind: SessionKind): void {
    const ses = session.fromPartition(PARTITIONS[kind])
    void ses.clearStorageData().catch(() => undefined)
    void ses.clearCache().catch(() => undefined)
    void ses.clearAuthCache().catch(() => undefined)
  }

  /**
   * "Fire": closes windows and erases what was collected, the fastest way to leave no trace.
   * A new fingerprint identity is generated as well, so sites cannot connect the next visit with the last one.
   */
  async fire(options: FireOptions, initiator: WindowController | null): Promise<void> {
    const { history, downloads, privacy, sites, shield } = this.services
    // the window you end up in is the same kind as the one you pressed Fire in (private stays private, Tor stays Tor)
    const freshKind: SessionKind = initiator?.kind ?? 'normal'
    // Nothing that happens while windows disappear may overwrite the saved session with a half-empty one.
    this.frozenUntil = Date.now() + 15_000
    try {
      if (options.tabs) {
        const fresh = this.createWindow({ isPrivate: freshKind !== 'normal', tor: freshKind === 'tor' })
        for (const c of this.all()) if (c !== fresh && !c.window.isDestroyed()) c.window.destroy()
        this.lastFocused = fresh
      }
      if (options.history) {
        history.clear()
        this.sessionStore.clear()
      }
      if (options.downloads) downloads.clearHistory()
      if (options.permissions) sites.clear({ permissions: true, exceptions: false })

      const partitions = [NORMAL_PARTITION, PRIVATE_PARTITION, TOR_PARTITION, 'f2px-net']
      await Promise.all(
        partitions.map(async (name) => {
          const ses = session.fromPartition(name)
          try {
            if (options.cookies) {
              await ses.clearStorageData()
              await ses.clearAuthCache()
              await ses.clearHostResolverCache()
              await ses.clearSharedDictionaryCache()
            }
            if (options.cache) {
              await ses.clearCache()
              await ses.clearCodeCaches({})
            }
            if (options.cookies || options.cache) await ses.closeAllConnections()
          } catch (error) {
            console.warn('[fire] could not clear', name, error)
          }
        })
      )
      if (options.cookies) shield.rotate()
      privacy.flush()
    } finally {
      this.frozenUntil = 0
      this.saveSessionNow()
    }
  }

  ownerOf(contents: WebContents): SenderInfo | null {
    for (const controller of this.controllers) {
      if (controller.shell.webContents === contents) return { kind: 'shell', controller }
      if (controller.tabs.some((t) => t.contents === contents)) return { kind: 'page', controller }
    }
    return null
  }

  // ── session persistence ────────────────────────────────────────────────
  setQuitting(): void {
    if (this.quitting) return
    this.saveSessionNow()
    this.quitting = true
  }

  /**
   * Called when a window starts closing. One window closing is a user action (the session then
   * shrinks); several in quick succession mean the whole app is shutting down, so the snapshot
   * taken before the first one must not be overwritten by the smaller ones.
   */
  windowClosing(): void {
    const now = Date.now()
    if (now - this.lastCloseAt < 1000) this.frozenUntil = now + 4000
    else this.saveSessionNow()
    this.lastCloseAt = now
  }

  saveSessionNow(): void {
    if (this.quitting || Date.now() < this.frozenUntil) return
    const windows = this.all()
      .filter((c) => !c.isPrivate && !c.window.isDestroyed())
      .map((c) => c.exportState())
      .filter((w) => w.tabs.length > 0)
    if (windows.length === 0) return
    try {
      const session: SavedSession = { windows }
      this.sessionStore.save(session)
    } catch (error) {
      console.error('[session] save failed', error)
    }
  }

  /** Startup: restore the previous session when configured, otherwise open the start page. */
  start(extraUrl?: string): void {
    // First run: the welcome wizard (skipped by automated tests).
    if (!this.services.settings.get().onboarded && !process.env['F2PX_SKIP_ONBOARDING']) {
      this.createWindow({ isPrivate: false, url: 'f2px://welcome' })
      if (extraUrl) this.openUrl(extraUrl)
      return
    }
    const restore = this.services.settings.get().startupBehavior === 'restore' ? this.sessionStore.load() : null
    if (restore) {
      restore.windows.forEach((state) => this.createWindow({ isPrivate: false, state }))
      if (extraUrl) this.openUrl(extraUrl)
    } else {
      this.createWindow({ isPrivate: false, url: extraUrl ? (resolveInput(extraUrl, this.services.settings.get().searchEngine)?.url ?? HOME_URL) : HOME_URL })
    }
  }

  // ── settings side effects ──────────────────────────────────────────────
  relayoutAll(): void {
    for (const c of this.controllers) {
      c.applyTheme()
      c.layout()
      c.pushState()
    }
  }

  anyWindowFocused(): boolean {
    return BrowserWindow.getAllWindows().some((w) => w.isFocused())
  }
}

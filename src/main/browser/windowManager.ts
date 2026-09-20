import { BrowserWindow, session, type Session, type WebContents } from 'electron'
import { HOME_URL, resolveInput, type InternalPage } from '../../shared/url'
import type { AppServices } from '../services'
import { debounce } from '../utils/emitter'
import { configureSession } from './sessionSetup'
import type { SavedSession, SavedWindow, SessionStore } from './sessionStore'
import { WindowController } from './windowController'

export const NORMAL_PARTITION = 'persist:f2px'
/** No `persist:` prefix -> kept in memory only; shared by all private windows. */
export const PRIVATE_PARTITION = 'f2px-private'

export interface CreateWindowOptions {
  isPrivate: boolean
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
    services.downloads.setSessionProvider((isPrivate) => this.sessionFor(isPrivate))
    services.bookmarks.onChange.on(() => this.all().forEach((c) => c.pushState()))
    services.privacy.onBlocked = (id) => this.noteBlocked(id)
  }

  private noteBlocked(webContentsId: number | undefined): void {
    if (webContentsId === undefined) return
    for (const controller of this.controllers) {
      const tab = controller.tabs.find((t) => t.contents.id === webContentsId)
      if (tab) {
        tab.blocked++
        controller.pushState()
        return
      }
    }
  }

  // ── sessions ───────────────────────────────────────────────────────────
  sessionFor(isPrivate: boolean): Session {
    const ses = session.fromPartition(isPrivate ? PRIVATE_PARTITION : NORMAL_PARTITION)
    configureSession(
      ses,
      {
        settings: this.services.settings,
        downloads: this.services.downloads,
        privacy: this.services.privacy,
        parentWindow: (contents) => this.ownerOf(contents)?.controller.window
      },
      isPrivate
    )
    return ses
  }

  // ── windows ────────────────────────────────────────────────────────────
  all(): WindowController[] {
    return [...this.controllers]
  }

  createWindow(options: CreateWindowOptions): WindowController {
    const controller = new WindowController(this, options.isPrivate, this.sessionFor(options.isPrivate), this.services)
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
    if (controller.isPrivate && !this.all().some((c) => c.isPrivate)) this.wipePrivateData()
    this.scheduleSessionSave()
  }

  /** Everything a private session collected disappears together with its last window. */
  private wipePrivateData(): void {
    const ses = session.fromPartition(PRIVATE_PARTITION)
    void ses.clearStorageData().catch(() => undefined)
    void ses.clearCache().catch(() => undefined)
    this.services.downloads.purgePrivate()
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

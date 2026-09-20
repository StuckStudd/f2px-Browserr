import { WebContentsView, nativeTheme, type BrowserWindow, type ContextMenuParams, type Session, type WebContents } from 'electron'
import { matchShortcut, type ShortcutAction } from '../../shared/shortcuts'
import type { FindState, TabInfo, TabSecurity } from '../../shared/types'
import { displayUrlFor, errorPageUrl, hostOf, internalPageOf, isInternalUrl } from '../../shared/url'
import { paths } from '../paths'
import type { AppServices } from '../services'
import { applyChromeCompat } from './chromeCompat'
import { classifyLoadError, isIgnorableLoadError } from './errorPages'
import { classifyNavigation, openExternalWithConsent } from './externalProtocol'

/** What a tab needs from the window that owns it. Implemented by WindowController. */
export interface TabHost {
  readonly isPrivate: boolean
  readonly session: Session
  readonly services: AppServices
  readonly window: BrowserWindow
  tabChanged(tab: Tab, persist: boolean): void
  openFromTab(tab: Tab, url: string, background: boolean): void
  htmlFullscreenChanged(tab: Tab, on: boolean): void
  showContextMenu(tab: Tab, params: ContextMenuParams): void
  runShortcut(action: ShortcutAction): void
  findResult(result: FindState): void
  hardenPopup(contents: WebContents): void
}

export interface TabInit {
  url?: string
  title?: string
  pinned?: boolean
  /** Restore without loading: the page is fetched the first time the tab is activated. */
  lazy?: boolean
}

let nextTabId = 1

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]

export class Tab {
  readonly id = nextTabId++
  readonly view: WebContentsView
  pinned: boolean
  title: string
  favicon: string | null = null
  loading = false
  audible = false
  /** Trackers blocked since the last top-level navigation. */
  blocked = 0
  private url = ''
  /** Host of the last committed document (`url` may already point at a pending navigation). */
  private committedHost = ''
  private lazyUrl: string | null = null
  private visitId: number | null = null
  private lastVisit = { url: '', at: 0 }

  constructor(
    private readonly host: TabHost,
    init: TabInit
  ) {
    this.pinned = init.pinned ?? false
    this.title = init.title ?? ''
    this.view = new WebContentsView({
      webPreferences: {
        session: host.session,
        preload: paths.preload(),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: host.services.settings.get().spellcheck
      }
    })
    this.applyBackground('')
    // Never reveal the local network address through WebRTC; only the public route is exposed.
    this.contents.setWebRTCIPHandlingPolicy('default_public_interface_only')
    this.wire()
    if (host.services.settings.get().chromeCompat) void applyChromeCompat(this.contents)

    if (init.url && init.lazy) {
      this.lazyUrl = init.url
      this.url = init.url
    } else if (init.url) {
      this.load(init.url)
    }
  }

  get contents(): WebContents {
    return this.view.webContents
  }

  get currentUrl(): string {
    return this.lazyUrl ?? (this.contents.isDestroyed() ? this.url : this.contents.getURL() || this.url)
  }

  /** Loads a deferred (restored) tab. Returns true when a load was started. */
  ensureLoaded(): boolean {
    if (!this.lazyUrl) return false
    const url = this.lazyUrl
    this.lazyUrl = null
    this.load(url)
    return true
  }

  /**
   * Web pages without their own background must stay white (black text on a dark view is unreadable),
   * while our own pages keep the dark canvas to avoid a white flash.
   */
  private applyBackground(url: string): void {
    const dark = nativeTheme.shouldUseDarkColors
    this.view.setBackgroundColor(isInternalUrl(url) || !url ? (dark ? '#0a0a0a' : '#f3f3f1') : '#ffffff')
  }

  load(url: string): void {
    this.lazyUrl = null
    this.url = url
    this.applyBackground(url)
    this.contents.loadURL(url).catch(() => {
      /* failures surface through did-fail-load and end up on the error page */
    })
    this.host.tabChanged(this, false)
  }

  reload(hard: boolean): void {
    const url = this.contents.getURL()
    if (internalPageOf(url) === 'error') {
      const original = displayUrlFor(url)
      if (original) return this.load(original)
    }
    if (this.lazyUrl) {
      this.ensureLoaded()
      return
    }
    if (hard) this.contents.reloadIgnoringCache()
    else this.contents.reload()
  }

  goBack(): void {
    if (this.contents.navigationHistory.canGoBack()) this.contents.navigationHistory.goBack()
  }

  goForward(): void {
    if (this.contents.navigationHistory.canGoForward()) this.contents.navigationHistory.goForward()
  }

  stop(): void {
    this.contents.stop()
  }

  setMuted(muted: boolean): void {
    this.contents.setAudioMuted(muted)
    this.host.tabChanged(this, false)
  }

  stepZoom(direction: 'in' | 'out' | 'reset'): void {
    if (direction === 'reset') return this.setZoom(1)
    const current = this.contents.getZoomFactor()
    const next =
      direction === 'in'
        ? (ZOOM_STEPS.find((z) => z > current + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1])
        : ([...ZOOM_STEPS].reverse().find((z) => z < current - 0.001) ?? ZOOM_STEPS[0])
    this.setZoom(next)
  }

  private setZoom(factor: number): void {
    this.contents.setZoomFactor(factor)
    this.host.tabChanged(this, false)
  }

  get zoomPercent(): number {
    return Math.round(this.contents.getZoomFactor() * 100)
  }

  info(): TabInfo {
    const wc = this.contents
    const url = this.currentUrl
    let security: TabSecurity = 'insecure'
    if (isInternalUrl(url)) security = internalPageOf(url) === 'error' ? 'error' : 'internal'
    else if (url.startsWith('https:')) security = 'secure'
    else if (url.startsWith('file:')) security = 'local'
    else if (!url) security = 'internal'

    const alive = !wc.isDestroyed()
    return {
      id: this.id,
      url,
      displayUrl: displayUrlFor(url),
      title: this.title,
      favicon: this.favicon,
      loading: this.loading,
      canGoBack: alive && !this.lazyUrl && wc.navigationHistory.canGoBack(),
      canGoForward: alive && !this.lazyUrl && wc.navigationHistory.canGoForward(),
      pinned: this.pinned,
      audible: this.audible,
      muted: alive && wc.isAudioMuted(),
      security,
      blocked: this.blocked
    }
  }

  destroy(): void {
    const wc = this.contents
    if (!wc.isDestroyed()) wc.close({ waitForBeforeUnload: false })
  }

  // ── event wiring ────────────────────────────────────────────────────────
  private wire(): void {
    const wc = this.contents
    const changed = (persist = false): void => this.host.tabChanged(this, persist)

    wc.setWindowOpenHandler((details) => {
      const fromInternal = isInternalUrl(wc.getURL())
      const verdict = classifyNavigation(details.url, fromInternal)
      if (verdict === 'external') {
        void openExternalWithConsent(details.url, this.host.window)
        return { action: 'deny' }
      }
      const isBlank = details.url === '' || details.url === 'about:blank'
      const looksLikePopup = details.disposition === 'new-window' && /width|height|popup/i.test(details.features)
      // window.open() popups (OAuth, payment windows) need a real window.opener link.
      if ((looksLikePopup || (isBlank && details.disposition !== 'background-tab')) && !fromInternal) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            backgroundColor: '#0a0a0a',
            icon: paths.resource('icon.png'),
            webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
          }
        }
      }
      if (verdict === 'allow' && !isBlank) {
        this.host.openFromTab(this, details.url, details.disposition === 'background-tab')
      }
      return { action: 'deny' }
    })
    wc.on('did-create-window', (child) => this.host.hardenPopup(child.webContents))

    wc.on('will-navigate', (event, url) => {
      const verdict = classifyNavigation(url, isInternalUrl(wc.getURL()))
      if (verdict === 'allow') return
      event.preventDefault()
      if (verdict === 'external') void openExternalWithConsent(url, this.host.window)
    })
    wc.on('will-redirect', (event, url) => {
      if (classifyNavigation(url, isInternalUrl(wc.getURL())) !== 'allow') event.preventDefault()
    })

    wc.on('page-title-updated', (_e, title) => {
      this.title = title
      if (this.visitId !== null) this.host.services.history.updateVisit(this.visitId, { title })
      changed(true)
    })

    wc.on('page-favicon-updated', (_e, favicons) => {
      const icon = favicons.find((f) => /^https?:|^data:/i.test(f)) ?? null
      this.favicon = icon
      if (icon && !this.host.isPrivate) {
        this.host.services.history.saveFavicon(wc.getURL(), icon)
        this.host.services.bookmarks.updateFavicon(wc.getURL(), icon)
        if (this.visitId !== null) this.host.services.history.updateVisit(this.visitId, { favicon: icon })
      }
      changed()
    })

    wc.on('did-start-loading', () => {
      this.loading = true
      changed()
    })
    wc.on('did-stop-loading', () => {
      this.loading = false
      changed()
    })

    wc.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) {
        this.applyBackground(details.url)
        this.blocked = 0
      }
    })
    wc.on('did-navigate', (_e, url) => this.onNavigated(url, false))
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (isMainFrame) this.onNavigated(url, true)
    })

    wc.on('did-fail-load', (_e, code, description, validatedUrl, isMainFrame) => {
      if (!isMainFrame || isInternalUrl(validatedUrl)) return
      if (isIgnorableLoadError(code)) {
        // Aborted, typically because the navigation turned into a download: show the page that is really open.
        this.loading = false
        setImmediate(() => {
          if (wc.isDestroyed()) return
          this.url = wc.getURL() || this.url
          changed()
        })
        return
      }
      // Stopped by threat protection (cancelled request -> ERR_BLOCKED_BY_CLIENT): explain and offer a way out.
      const threat = code === -20 ? this.host.services.privacy.consumeThreat(validatedUrl) : null
      if (threat) {
        this.loading = false
        wc.loadURL(errorPageUrl('threat', validatedUrl, undefined, threat)).catch(() => undefined)
        return
      }
      // A page we upgraded to https:// that cannot be reached securely: let the user decide about plain HTTP.
      const original = code <= -200 && code >= -299 ? null : this.host.services.privacy.consumeUpgrade(validatedUrl)
      if (original) {
        this.loading = false
        wc.loadURL(errorPageUrl('httpsonly', original, code, description)).catch(() => undefined)
        return
      }
      const kind = classifyLoadError(code)
      this.loading = false
      wc.loadURL(errorPageUrl(kind, validatedUrl, code, description)).catch(() => undefined)
    })

    wc.on('render-process-gone', (_e, details) => {
      if (details.reason === 'clean-exit') return
      const failedUrl = displayUrlFor(this.url) || this.url
      this.loading = false
      if (failedUrl) wc.loadURL(errorPageUrl('crash', failedUrl, undefined, details.reason)).catch(() => undefined)
    })

    wc.on('audio-state-changed', (event) => {
      this.audible = event.audible
      changed()
    })

    wc.on('enter-html-full-screen', () => this.host.htmlFullscreenChanged(this, true))
    wc.on('leave-html-full-screen', () => this.host.htmlFullscreenChanged(this, false))

    wc.on('context-menu', (_e, params) => this.host.showContextMenu(this, params))

    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const action = matchShortcut(input)
      if (!action) return
      event.preventDefault()
      this.host.runShortcut(action)
    })

    wc.on('zoom-changed', (_e, direction) => this.stepZoom(direction))
    wc.on('found-in-page', (_e, result) => {
      if (result.finalUpdate) this.host.findResult({ active: result.activeMatchOrdinal, total: result.matches })
    })
  }

  private onNavigated(url: string, inPage: boolean): void {
    const host = hostOf(url)
    this.url = url
    if (!inPage && host !== this.committedHost) this.favicon = null
    this.committedHost = host
    if (!inPage) this.title = internalPageOf(url) ? this.title : ''

    this.visitId = null
    if (!this.host.isPrivate && /^https?:/i.test(url)) {
      const now = Date.now()
      // Reloads and rapid duplicate commits should not flood the history.
      if (this.lastVisit.url !== url || now - this.lastVisit.at > 3000) {
        this.visitId = this.host.services.history.addVisit(url, this.contents.getTitle(), this.favicon)
        this.lastVisit = { url, at: now }
      }
    }
    this.host.tabChanged(this, true)
  }
}

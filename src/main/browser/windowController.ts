import path from 'node:path'
import { BrowserWindow, WebContentsView, nativeTheme, type ContextMenuParams, type Session, type WebContents } from 'electron'
import { FIND_BAR_HEIGHT, chromeLayout } from '../../shared/settings'
import type { ShortcutAction } from '../../shared/shortcuts'
import { matchShortcut } from '../../shared/shortcuts'
import type { FindState, OverlayMenuItem, ShellState } from '../../shared/types'
import { HOME_URL, internalPageOf, resolveInput, type InternalPage } from '../../shared/url'
import { paths } from '../paths'
import type { AppServices } from '../services'
import { policyFor, type SessionKind } from '../privacy/policy'
import { applyEmulation } from './pageEmulation'
import { classifyNavigation } from './externalProtocol'
import { buildPageMenu } from './pageContextMenu'
import type { SavedWindow } from './sessionStore'
import { Tab, type TabHost, type TabInit } from './tab'
import type { WindowManager } from './windowManager'

interface ClosedTab {
  url: string
  title: string
  pinned: boolean
  index: number
}

export interface CreateTabOptions extends TabInit {
  background?: boolean
  openerId?: number
  index?: number
}

const MAX_CLOSED_TABS = 25

export function titleBarColors(): { color: string; symbolColor: string } {
  return nativeTheme.shouldUseDarkColors
    ? { color: '#050505', symbolColor: '#b8b8b8' }
    : { color: '#efefed', symbolColor: '#2a2a2a' }
}

/** One browser window: native frame + shell UI (tabs/toolbar) + a WebContentsView per tab. */
export class WindowController implements TabHost {
  readonly window: BrowserWindow
  readonly shell: WebContentsView
  readonly tabs: Tab[] = []
  private active: Tab | null = null
  private closedTabs: ClosedTab[] = []
  private overlayOpen = false
  private findBarOpen = false
  private htmlFullscreen: Tab | null = null
  private fullscreenBefore = false
  private menus = new Map<number, Map<string, () => void>>()
  private nextMenuId = 1
  private lastFind = { text: '', matchCase: false }
  private statePending = false
  private closed = false

  readonly isPrivate: boolean

  constructor(
    private readonly manager: WindowManager,
    readonly kind: SessionKind,
    readonly session: Session,
    readonly services: AppServices
  ) {
    this.isPrivate = kind !== 'normal'
    const layout = chromeLayout(services.settings.get())
    this.window = new BrowserWindow({
      width: 1320,
      height: 840,
      minWidth: 720,
      minHeight: 460,
      show: false,
      title: 'F2PX Browser',
      backgroundColor: '#050505',
      icon: paths.resource('icon.ico'),
      titleBarStyle: 'hidden',
      titleBarOverlay: { ...titleBarColors(), height: layout.tabs },
      autoHideMenuBar: true
    })
    this.window.removeMenu()

    this.shell = new WebContentsView({
      webPreferences: {
        preload: paths.preload(),
        additionalArguments: ['--f2px-shell'],
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true
      }
    })
    this.shell.setBackgroundColor('#00000000')
    this.window.contentView.addChildView(this.shell)
    this.wireShell()
    this.wireWindow()
    this.layout()
  }

  // ── construction helpers ───────────────────────────────────────────────
  private wireShell(): void {
    const wc = this.shell.webContents
    wc.setWindowOpenHandler(() => ({ action: 'deny' }))
    wc.on('will-navigate', (event) => event.preventDefault())
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const action = matchShortcut(input)
      // Text-editing keys inside the omnibox must keep working; everything else is a browser shortcut.
      if (!action) return
      event.preventDefault()
      this.runShortcut(action)
    })
    wc.on('render-process-gone', () => wc.reload())
    wc.once('did-finish-load', () => {
      if (!this.window.isDestroyed()) this.window.show()
    })

    const query = this.isPrivate ? { private: '1' } : undefined
    if (process.env['ELECTRON_RENDERER_URL']) {
      void wc.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html${this.isPrivate ? '?private=1' : ''}`)
    } else {
      void wc.loadFile(path.join(paths.rendererRoot(), 'index.html'), { query })
    }
  }

  private wireWindow(): void {
    const win = this.window
    const relayout = (): void => {
      this.layout()
      this.pushState()
    }
    win.on('resize', relayout)
    win.on('maximize', relayout)
    win.on('unmaximize', relayout)
    win.on('enter-full-screen', relayout)
    win.on('leave-full-screen', relayout)
    win.on('focus', () => this.manager.focused(this))
    win.on('minimize', () => {
      if (this.services.settings.get().minimizeToTray) win.hide()
    })
    // Mouse "back/forward" buttons and keyboard browser keys.
    win.on('app-command', (_e, command) => {
      if (command === 'browser-backward') this.active?.goBack()
      else if (command === 'browser-forward') this.active?.goForward()
    })
    win.on('close', () => this.manager.windowClosing())
    win.on('session-end', () => this.manager.setQuitting())
    win.on('closed', () => this.dispose())
  }

  private dispose(): void {
    if (this.closed) return
    this.closed = true
    for (const tab of this.tabs) tab.destroy()
    this.tabs.length = 0
    if (!this.shell.webContents.isDestroyed()) this.shell.webContents.close()
    this.manager.controllerClosed(this)
  }

  // ── geometry ───────────────────────────────────────────────────────────
  chromeHeight(): number {
    return chromeLayout(this.services.settings.get()).total + (this.findBarOpen ? FIND_BAR_HEIGHT : 0)
  }

  setFindBar(open: boolean): void {
    if (this.findBarOpen === open) return
    this.findBarOpen = open
    if (!open) this.stopFind()
    this.layout()
  }

  layout(): void {
    if (this.window.isDestroyed()) return
    const [width, height] = this.window.getContentSize()
    const chrome = this.chromeHeight()

    if (this.htmlFullscreen) {
      this.shell.setVisible(false)
      this.htmlFullscreen.view.setBounds({ x: 0, y: 0, width, height })
      return
    }
    this.shell.setVisible(true)
    // While a popup/menu is open the shell covers the whole window (its background is transparent).
    this.shell.setBounds({ x: 0, y: 0, width, height: this.overlayOpen ? height : chrome })
    const pageBounds = { x: 0, y: chrome, width, height: Math.max(0, height - chrome) }
    for (const tab of this.tabs) {
      if (tab === this.active) tab.view.setBounds(pageBounds)
    }
  }

  applyTheme(): void {
    if (this.window.isDestroyed() || process.platform !== 'win32') return
    const layout = chromeLayout(this.services.settings.get())
    this.window.setTitleBarOverlay({ ...titleBarColors(), height: layout.tabs })
  }

  setOverlay(open: boolean): void {
    if (this.overlayOpen === open) return
    this.overlayOpen = open
    this.layout()
  }

  private raiseShell(): void {
    // Re-adding an existing child moves it to the top of the stacking order.
    this.window.contentView.addChildView(this.shell)
  }

  // ── tabs ───────────────────────────────────────────────────────────────
  get activeTab(): Tab | null {
    return this.active
  }

  createTab(options: CreateTabOptions = {}): Tab {
    const tab = new Tab(this, {
      url: options.url ?? HOME_URL,
      title: options.title,
      pinned: options.pinned,
      lazy: options.lazy
    })
    const pinnedCount = this.tabs.filter((t) => t.pinned).length
    let index = options.index ?? this.tabs.length
    const opener = options.openerId ? this.tabs.findIndex((t) => t.id === options.openerId) : -1
    if (options.index === undefined && opener >= 0) index = opener + 1
    index = tab.pinned ? Math.min(index, pinnedCount) : Math.max(index, pinnedCount)
    this.tabs.splice(Math.min(index, this.tabs.length), 0, tab)

    tab.view.setVisible(false)
    this.window.contentView.addChildView(tab.view)
    this.raiseShell()
    if (!options.background) this.activate(tab)
    this.tabChanged(tab, true)
    return tab
  }

  activate(target: Tab | number): void {
    const tab = typeof target === 'number' ? this.tabs.find((t) => t.id === target) : target
    if (!tab || !this.tabs.includes(tab)) return
    if (this.active && this.active !== tab) {
      this.active.contents.stopFindInPage('clearSelection')
      this.active.view.setVisible(false)
    }
    this.active = tab
    tab.ensureLoaded()
    tab.view.setVisible(true)
    this.layout()
    this.raiseShell()
    if (!this.overlayOpen) tab.contents.focus()
    this.pushState()
    this.manager.scheduleSessionSave()
  }

  closeTab(id: number): void {
    const index = this.tabs.findIndex((t) => t.id === id)
    if (index < 0) return
    const tab = this.tabs[index]
    const url = tab.currentUrl
    if (url && internalPageOf(url) !== 'home' && !this.isPrivate) {
      this.closedTabs.push({ url, title: tab.title, pinned: tab.pinned, index })
      if (this.closedTabs.length > MAX_CLOSED_TABS) this.closedTabs.shift()
    }

    if (this.tabs.length === 1) {
      this.window.close()
      return
    }
    this.tabs.splice(index, 1)
    if (this.htmlFullscreen === tab) this.htmlFullscreenChanged(tab, false)
    this.window.contentView.removeChildView(tab.view)
    tab.destroy()
    if (this.active === tab) {
      this.active = null
      this.activate(this.tabs[Math.min(index, this.tabs.length - 1)])
    }
    this.pushState()
    this.manager.scheduleSessionSave()
  }

  closeOthers(id: number): void {
    for (const tab of [...this.tabs]) if (tab.id !== id && !tab.pinned) this.closeTab(tab.id)
  }

  closeToRight(id: number): void {
    const index = this.tabs.findIndex((t) => t.id === id)
    for (const tab of this.tabs.slice(index + 1)) if (!tab.pinned) this.closeTab(tab.id)
  }

  reopenClosedTab(): void {
    const closed = this.closedTabs.pop()
    if (closed) this.createTab({ url: closed.url, title: closed.title, pinned: closed.pinned, index: closed.index })
  }

  moveTab(id: number, toIndex: number): void {
    const from = this.tabs.findIndex((t) => t.id === id)
    if (from < 0) return
    const tab = this.tabs[from]
    const pinnedCount = this.tabs.filter((t) => t.pinned).length
    const [min, max] = tab.pinned ? [0, pinnedCount - 1] : [pinnedCount, this.tabs.length - 1]
    const to = Math.min(Math.max(toIndex, min), max)
    if (to === from) return
    this.tabs.splice(from, 1)
    this.tabs.splice(to, 0, tab)
    this.pushState()
    this.manager.scheduleSessionSave()
  }

  pinTab(id: number, pinned: boolean): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab || tab.pinned === pinned) return
    tab.pinned = pinned
    const from = this.tabs.indexOf(tab)
    this.tabs.splice(from, 1)
    const pinnedCount = this.tabs.filter((t) => t.pinned).length
    this.tabs.splice(pinnedCount, 0, tab)
    this.pushState()
    this.manager.scheduleSessionSave()
  }

  duplicateTab(id: number): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (tab) this.createTab({ url: tab.currentUrl, openerId: tab.id })
  }

  switchRelative(delta: number): void {
    if (this.tabs.length < 2 || !this.active) return
    const index = this.tabs.indexOf(this.active)
    this.activate(this.tabs[(index + delta + this.tabs.length) % this.tabs.length])
  }

  // ── navigation ─────────────────────────────────────────────────────────
  navigate(input: string, newTab = false): void {
    const resolved = resolveInput(input, this.services.settings.get().searchEngine)
    if (!resolved) return
    if (newTab || !this.active) this.createTab({ url: resolved.url })
    else this.active.load(resolved.url)
  }

  navigateTab(contents: WebContents, input: string, newTab = false): void {
    const tab = this.tabs.find((t) => t.contents === contents)
    if (newTab || !tab) return this.navigate(input, newTab)
    const resolved = resolveInput(input, this.services.settings.get().searchEngine)
    if (resolved) tab.load(resolved.url)
  }

  homeUrl(): string {
    return this.services.settings.get().homeUrl || HOME_URL
  }

  openInternal(page: InternalPage): void {
    const url = `f2px://${page}`
    const existing = this.tabs.find((t) => t.currentUrl.startsWith(url))
    if (existing) this.activate(existing)
    else this.createTab({ url })
  }

  // ── TabHost implementation ─────────────────────────────────────────────
  tabChanged(_tab: Tab, persist: boolean): void {
    this.pushState()
    if (persist) this.manager.scheduleSessionSave()
  }

  openFromTab(tab: Tab, url: string, background: boolean): void {
    this.createTab({ url, background, openerId: tab.id })
  }

  htmlFullscreenChanged(tab: Tab, on: boolean): void {
    if (on) {
      this.fullscreenBefore = this.window.isFullScreen()
      this.htmlFullscreen = tab
      this.window.setFullScreen(true)
    } else if (this.htmlFullscreen === tab) {
      this.htmlFullscreen = null
      if (!this.fullscreenBefore && !this.window.isDestroyed()) this.window.setFullScreen(false)
    }
    this.layout()
    this.pushState()
  }

  showContextMenu(tab: Tab, params: ContextMenuParams): void {
    if (tab !== this.active) return
    const { items, actions } = buildPageMenu({
      tab,
      params,
      searchEngine: this.services.settings.get().searchEngine,
      openTab: (url, background) => this.createTab({ url, background, openerId: tab.id }),
      runHistory: (action) => {
        if (action === 'back') tab.goBack()
        else if (action === 'forward') tab.goForward()
        else if (action === 'reload') tab.reload(false)
        else tab.contents.print()
      }
    })
    this.showMenu(params.x, params.y + this.chromeHeight(), items, actions)
  }

  private showMenu(x: number, y: number, items: OverlayMenuItem[], actions: Map<string, () => void>): void {
    const menuId = this.nextMenuId++
    this.menus.clear()
    this.menus.set(menuId, actions)
    this.setOverlay(true)
    this.services.hub.send(this.shell.webContents, 'shell:show-menu', { menuId, x, y, items })
  }

  menuSelected(menuId: number, itemId: string | null): void {
    const actions = this.menus.get(menuId)
    this.menus.delete(menuId)
    if (itemId) actions?.get(itemId)?.()
  }

  findResult(result: FindState): void {
    this.services.hub.send(this.shell.webContents, 'shell:find-result', result)
  }

  hardenPopup(contents: WebContents): void {
    const settings = this.services.settings.get()
    void applyEmulation(contents, { chromeCompat: settings.chromeCompat, neutralLocale: policyFor(settings, this.kind).fingerprint === 'strict' })
    contents.setWebRTCIPHandlingPolicy(
      policyFor(settings, this.kind).webrtc === 'proxy-only' ? 'disable_non_proxied_udp' : 'default_public_interface_only'
    )
    contents.setWindowOpenHandler(({ url }) => {
      if (classifyNavigation(url, false) === 'allow') this.createTab({ url })
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      if (classifyNavigation(url, false) !== 'allow') event.preventDefault()
    })
  }

  // ── shortcuts ──────────────────────────────────────────────────────────
  runShortcut(action: ShortcutAction): void {
    const tab = this.active
    switch (action) {
      case 'newTab':
        this.createTab({ url: HOME_URL })
        break
      case 'closeTab':
        if (tab) this.closeTab(tab.id)
        break
      case 'reopenTab':
        this.reopenClosedTab()
        break
      case 'focusAddress':
        this.focusOmnibox()
        break
      case 'bookmark':
        this.services.hub.send(this.shell.webContents, 'shell:bookmark-popup')
        break
      case 'history':
        this.openInternal('history')
        break
      case 'downloads':
        this.openInternal('downloads')
        break
      case 'bookmarksPage':
        this.openInternal('bookmarks')
        break
      case 'settings':
        this.openInternal('settings')
        break
      case 'toggleBookmarksBar':
        this.services.settings.update({ showBookmarksBar: !this.services.settings.get().showBookmarksBar })
        break
      case 'reload':
        tab?.reload(false)
        break
      case 'hardReload':
        tab?.reload(true)
        break
      case 'nextTab':
        this.switchRelative(1)
        break
      case 'prevTab':
        this.switchRelative(-1)
        break
      case 'newWindow':
        this.manager.createWindow({ isPrivate: false })
        break
      case 'privateWindow':
        this.manager.createWindow({ isPrivate: true })
        break
      case 'torWindow':
        this.manager.createWindow({ isPrivate: true, tor: true })
        break
      case 'fire':
        this.shell.webContents.focus()
        this.services.hub.send(this.shell.webContents, 'shell:fire')
        break
      case 'palette':
      case 'tabSearch':
        this.shell.webContents.focus()
        this.services.hub.send(this.shell.webContents, 'shell:palette', { mode: action === 'tabSearch' ? 'tabs' : 'all' })
        break
      case 'privacy':
        this.openInternal('privacy')
        break
      case 'back':
        tab?.goBack()
        break
      case 'forward':
        tab?.goForward()
        break
      case 'home':
        tab?.load(this.homeUrl())
        break
      case 'find':
        this.services.hub.send(this.shell.webContents, 'shell:find')
        break
      case 'devtools':
        this.toggleDevTools()
        break
      case 'zoomIn':
        tab?.stepZoom('in')
        break
      case 'zoomOut':
        tab?.stepZoom('out')
        break
      case 'zoomReset':
        tab?.stepZoom('reset')
        break
      case 'fullscreen':
        this.window.setFullScreen(!this.window.isFullScreen())
        break
      case 'print':
        tab?.contents.print()
        break
      case 'lastTab':
        if (this.tabs.length) this.activate(this.tabs[this.tabs.length - 1])
        break
      default: {
        const n = Number(action.replace('tab', ''))
        if (Number.isInteger(n) && this.tabs[n - 1]) this.activate(this.tabs[n - 1])
      }
    }
  }

  focusOmnibox(): void {
    this.shell.webContents.focus()
    this.services.hub.send(this.shell.webContents, 'shell:focus-omnibox')
  }

  toggleDevTools(): void {
    const wc = this.active?.contents
    if (!wc) return
    if (wc.isDevToolsOpened()) wc.closeDevTools()
    else wc.openDevTools({ mode: 'detach' })
  }

  findText(text: string, forward = true, matchCase = false): void {
    const wc = this.active?.contents
    if (!wc) return
    if (!text) return wc.stopFindInPage('clearSelection')
    const same = text === this.lastFind.text && matchCase === this.lastFind.matchCase
    this.lastFind = { text, matchCase }
    // Electron 44 emits no `found-in-page` result when `findNext: false` is passed explicitly, so only set it when true.
    wc.findInPage(text, same ? { forward, matchCase, findNext: true } : { forward, matchCase })
  }

  stopFind(): void {
    this.lastFind = { text: '', matchCase: false }
    this.active?.contents.stopFindInPage('clearSelection')
  }

  // ── state ──────────────────────────────────────────────────────────────
  getState(): ShellState {
    const tab = this.active
    const url = tab?.currentUrl ?? ''
    return {
      tabs: this.tabs.map((t) => t.info()),
      activeId: tab?.id ?? null,
      isPrivate: this.isPrivate,
      isTor: this.kind === 'tor',
      isMaximized: this.window.isMaximized(),
      isFullscreen: this.window.isFullScreen(),
      bookmarked: !!url && this.services.bookmarks.findByUrl(url) !== null,
      canReopenTab: this.closedTabs.length > 0,
      zoomPercent: tab && !tab.contents.isDestroyed() ? tab.zoomPercent : 100
    }
  }

  /** Coalesces bursts of tab events into a single message per tick. */
  pushState(): void {
    if (this.statePending || this.closed) return
    this.statePending = true
    setImmediate(() => {
      this.statePending = false
      if (this.closed || this.shell.webContents.isDestroyed()) return
      this.updateWindowTitle()
      this.services.hub.send(this.shell.webContents, 'shell:state', this.getState())
    })
  }

  /** Taskbar / Alt+Tab title: "<page> — F2PX Browser" (private windows are labelled as such). */
  private updateWindowTitle(): void {
    if (this.window.isDestroyed()) return
    const app = this.kind === 'tor' ? 'F2PX Tor' : this.isPrivate ? 'F2PX Private' : 'F2PX Browser'
    const page = this.active?.title.trim()
    const title = page ? `${page} — ${app}` : app
    if (this.window.getTitle() !== title) this.window.setTitle(title)
  }

  exportState(): SavedWindow {
    const saved = this.tabs
      .map((t) => ({ tab: t, url: t.currentUrl }))
      .filter(({ url }) => url && internalPageOf(url) !== 'error')
    const activeIndex = Math.max(0, saved.findIndex(({ tab }) => tab === this.active))
    return {
      tabs: saved.map(({ tab, url }) => ({ url, title: tab.title, pinned: tab.pinned })),
      activeIndex
    }
  }

  restore(state: SavedWindow): void {
    state.tabs.forEach((saved, i) => {
      const isActive = i === state.activeIndex
      this.createTab({ url: saved.url, title: saved.title, pinned: saved.pinned, lazy: !isActive, background: !isActive, index: i })
    })
    if (this.tabs.length === 0) this.createTab({ url: HOME_URL })
  }
}

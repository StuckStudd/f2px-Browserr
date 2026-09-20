import { copyFile, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app, dialog, session } from 'electron'
import { HOME_URL, isWebUrl, resolveInput } from '../../shared/url'
import { PRIVACY_LEVELS } from '../../shared/privacy'
import type { Bookmark, ClearDataOptions, FireOptions, NetStatus, SiteInfo } from '../../shared/types'
import { trustCertificateHost } from '../browser/sessionSetup'
import { NORMAL_PARTITION, type WindowManager } from '../browser/windowManager'
import { paths } from '../paths'
import { SiteRules } from '../privacy/siteRules'
import { registrableDomain } from '../privacy/hosts'
import { privacyLevelPatch } from '../../shared/privacy'
import type { AppServices } from '../services'
import { ensureDir, sanitizeFilename } from '../utils/fsUtils'
import type { RpcContext, RpcTable } from './rpc'

const MAX_BACKGROUND_BYTES = 25 * 1024 * 1024
const MAX_IMPORT_BYTES = 30 * 1024 * 1024

export function createHandlers(services: AppServices, manager: WindowManager): RpcTable {
  const { settings, history, bookmarks, quickAccess, downloads, omnibox, privacy, vault, updates, sites, route, tor, favicons } = services
  const securityStatus = (): { encrypted: boolean; mode: typeof vault.mode } => ({ encrypted: vault.encrypted, mode: vault.mode })

  /** Only http(s) addresses or built-in pages may be opened programmatically. */
  const safeUrl = (input: string | undefined): string =>
    (input ? resolveInput(input, settings.get().searchEngine)?.url : undefined) ?? HOME_URL

  const activeTab = (c: RpcContext) => c.controller.activeTab

  const netStatus = async (): Promise<NetStatus> => ({ ...route.status(), tor: await tor.status() })

  /** What the shield knows about the active tab's site (the shield popup). */
  const siteInfo = (c: RpcContext): SiteInfo | null => {
    const tab = activeTab(c)
    const url = tab?.currentUrl ?? ''
    if (!tab || !isWebUrl(url)) return null
    const u = new URL(url)
    const policy = privacy.policyForPage(c.controller.kind, u.hostname)
    return {
      site: SiteRules.siteOf(u.hostname),
      host: u.hostname,
      origin: u.origin,
      shieldsUp: policy.shieldsUp,
      allowThirdPartyCookies: sites.cookiesAllowed(u.hostname),
      locked: c.controller.kind === 'tor',
      report: { ...tab.report },
      permissions: sites.listPermissions((origin) => origin === u.origin)
    }
  }

  async function clearData(options: ClearDataOptions): Promise<void> {
    if (options.history) history.clear()
    if (options.downloads) downloads.clearHistory()
    const ses = session.fromPartition(NORMAL_PARTITION)
    if (options.cookies) {
      await ses.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage']
      })
    }
    if (options.cache) {
      await ses.clearCache()
      await ses.clearCodeCaches({})
    }
  }

  async function setBackgroundFile(source: string): Promise<string> {
    ensureDir(paths.backgrounds())
    const ext = path.extname(source).toLowerCase()
    const name = `bg-${Date.now()}${ext}`
    await copyFile(source, path.join(paths.backgrounds(), name))
    await removeBackgroundFile()
    settings.update({ background: 'custom', backgroundImage: name })
    return name
  }

  async function removeBackgroundFile(): Promise<void> {
    const current = settings.get().backgroundImage
    if (!current) return
    try {
      await unlink(path.join(paths.backgrounds(), path.basename(current)))
    } catch {
      /* already removed */
    }
  }

  return {
    // ── shell ────────────────────────────────────────────────────────────
    'shell.state': { scope: 'shell', run: (c) => c.controller.getState() },
    'tabs.create': {
      scope: 'shell',
      run: (c, opts) => void c.controller.createTab({ url: safeUrl(opts?.url), background: opts?.background })
    },
    'tabs.close': { scope: 'shell', run: (c, id) => c.controller.closeTab(id) },
    'tabs.activate': { scope: 'shell', run: (c, id) => c.controller.activate(id) },
    'tabs.move': { scope: 'shell', run: (c, id, index) => c.controller.moveTab(id, index) },
    'tabs.pin': { scope: 'shell', run: (c, id, pinned) => c.controller.pinTab(id, !!pinned) },
    'tabs.mute': {
      scope: 'shell',
      run: (c, id, muted) => c.controller.tabs.find((t) => t.id === id)?.setMuted(!!muted)
    },
    'tabs.duplicate': { scope: 'shell', run: (c, id) => c.controller.duplicateTab(id) },
    'tabs.closeOthers': { scope: 'shell', run: (c, id) => c.controller.closeOthers(id) },
    'tabs.closeToRight': { scope: 'shell', run: (c, id) => c.controller.closeToRight(id) },
    'tabs.reopen': { scope: 'shell', run: (c) => c.controller.reopenClosedTab() },
    'nav.go': { scope: 'shell', run: (c, input, opts) => c.controller.navigate(String(input), opts?.newTab) },
    'nav.back': { scope: 'shell', run: (c) => activeTab(c)?.goBack() },
    'nav.forward': { scope: 'shell', run: (c) => activeTab(c)?.goForward() },
    'nav.reload': { scope: 'shell', run: (c, hard) => activeTab(c)?.reload(!!hard) },
    'nav.stop': { scope: 'shell', run: (c) => activeTab(c)?.stop() },
    'nav.home': { scope: 'shell', run: (c) => activeTab(c)?.load(c.controller.homeUrl()) },
    'omnibox.suggest': { scope: 'both', run: (_c, query) => omnibox.suggest(String(query ?? '')) },
    // Search suggestions go through the window's own route; Tor windows never send what you type anywhere.
    'omnibox.remote': {
      scope: 'both',
      run: (c, query) => omnibox.remote(String(query ?? ''), c.controller.kind === 'tor' ? null : c.controller.session)
    },
    'ui.overlay': { scope: 'shell', run: (c, open) => c.controller.setOverlay(!!open) },
    'ui.menuSelect': { scope: 'shell', run: (c, menuId, itemId) => c.controller.menuSelected(menuId, itemId) },
    'ui.openPage': { scope: 'shell', run: (c, page) => c.controller.openInternal(page) },
    'ui.newWindow': { scope: 'shell', run: (_c, isPrivate) => void manager.createWindow({ isPrivate: !!isPrivate }) },
    'ui.newTorWindow': { scope: 'shell', run: () => void manager.createWindow({ isPrivate: true, tor: true }) },
    'ui.focusPage': { scope: 'shell', run: (c) => activeTab(c)?.contents.focus() },
    'ui.print': { scope: 'shell', run: (c) => activeTab(c)?.contents.print() },
    'ui.savePdf': {
      scope: 'shell',
      run: async (c) => {
        const tab = activeTab(c)
        if (!tab || tab.contents.isDestroyed()) return false
        const result = await dialog.showSaveDialog(c.controller.window, {
          title: 'Save page as PDF',
          defaultPath: path.join(app.getPath('documents'), `${sanitizeFilename(tab.title || 'page')}.pdf`),
          filters: [{ name: 'PDF', extensions: ['pdf'] }]
        })
        if (result.canceled || !result.filePath) return false
        await writeFile(result.filePath, await tab.contents.printToPDF({ printBackground: true }))
        return true
      }
    },
    'ui.screenshot': {
      scope: 'shell',
      run: async (c) => {
        const tab = activeTab(c)
        if (!tab || tab.contents.isDestroyed()) return false
        const image = await tab.contents.capturePage()
        const result = await dialog.showSaveDialog(c.controller.window, {
          title: 'Save screenshot',
          defaultPath: path.join(app.getPath('pictures'), `${sanitizeFilename(tab.title || 'screenshot')}.png`),
          filters: [{ name: 'PNG image', extensions: ['png'] }]
        })
        if (result.canceled || !result.filePath) return false
        await writeFile(result.filePath, image.toPNG())
        return true
      }
    },
    'ui.devtools': { scope: 'shell', run: (c) => c.controller.toggleDevTools() },
    'ui.fullscreen': { scope: 'shell', run: (c) => c.controller.runShortcut('fullscreen') },
    'ui.zoom': { scope: 'shell', run: (c, dir) => activeTab(c)?.stepZoom(dir) },
    'ui.findBar': { scope: 'shell', run: (c, open) => c.controller.setFindBar(!!open) },
    'find.start': { scope: 'shell', run: (c, text, forward, matchCase) => c.controller.findText(String(text), forward ?? true, !!matchCase) },
    'find.stop': { scope: 'shell', run: (c) => c.controller.stopFind() },
    'bookmarks.ensureActive': {
      scope: 'shell',
      run: (c): Bookmark | null => {
        const tab = activeTab(c)
        const url = tab?.currentUrl ?? ''
        if (!tab || !isWebUrl(url)) return null
        const existing = bookmarks.findByUrl(url)
        if (existing) return existing
        return bookmarks.add({ title: tab.title || url, url, favicon: tab.favicon })
      }
    },

    // ── shared data ──────────────────────────────────────────────────────
    'settings.get': { scope: 'both', run: () => settings.get() },
    'settings.update': { scope: 'both', run: (_c, patch) => settings.update(patch) },
    // Private windows neither read nor write the regular history.
    'history.list': { scope: 'page', run: (c, query) => (c.controller.isPrivate ? [] : history.list(query)) },
    'history.remove': { scope: 'page', run: (c, ids) => (c.controller.isPrivate ? undefined : history.remove(ids)) },
    'history.clear': { scope: 'page', run: (c) => (c.controller.isPrivate ? undefined : history.clear()) },
    'bookmarks.tree': { scope: 'both', run: () => bookmarks.tree() },
    'bookmarks.add': { scope: 'both', run: (_c, input) => bookmarks.add(input) },
    'bookmarks.folder': { scope: 'both', run: (_c, title, parentId) => bookmarks.createFolder(String(title), parentId ?? null) },
    'bookmarks.update': { scope: 'both', run: (_c, id, patch) => bookmarks.update(id, patch) },
    'bookmarks.move': { scope: 'both', run: (_c, id, parentId, index) => bookmarks.move(id, parentId, index) },
    'bookmarks.remove': { scope: 'both', run: (_c, id) => bookmarks.remove(id) },
    'quickAccess.list': { scope: 'page', run: () => quickAccess.list() },
    'quickAccess.add': { scope: 'page', run: (_c, input) => quickAccess.add(input) },
    'quickAccess.update': { scope: 'page', run: (_c, id, patch) => quickAccess.update(id, patch) },
    'quickAccess.remove': { scope: 'page', run: (_c, id) => quickAccess.remove(id) },
    'quickAccess.reorder': { scope: 'page', run: (_c, ids) => quickAccess.reorder(ids) },
    'quickAccess.reset': { scope: 'page', run: () => quickAccess.reset() },
    'security.status': { scope: 'page', run: () => securityStatus() },
    'security.setPassword': {
      scope: 'page',
      run: async (_c, current, next) => {
        if (vault.needsPassword() && !vault.checkPassword(String(current ?? ''))) {
          await new Promise((r) => setTimeout(r, 600)) // slows down guessing from a page
          throw new Error('Current password is incorrect')
        }
        if (next === null) vault.removePassword()
        else vault.setPassword(String(next))
        return securityStatus()
      }
    },
    'threats.status': { scope: 'page', run: () => privacy.threats.status() },
    'threats.update': { scope: 'page', run: () => privacy.threats.update() },
    'update.status': { scope: 'page', run: () => updates.status() },
    'update.check': { scope: 'page', run: () => updates.check() },
    'privacy.stats': { scope: 'page', run: () => privacy.stats() },
    'privacy.resetStats': { scope: 'page', run: () => privacy.counters.reset() },
    'privacy.applyLevel': {
      scope: 'both',
      run: (_c, level) => {
        if (!PRIVACY_LEVELS.includes(level)) throw new Error('Unknown privacy level')
        return settings.update(privacyLevelPatch(settings.get(), level))
      }
    },
    'filters.status': { scope: 'page', run: () => privacy.lists.status() },
    'filters.update': { scope: 'page', run: () => privacy.lists.update() },
    'net.status': { scope: 'both', run: () => netStatus() },
    'net.refresh': {
      scope: 'both',
      run: async () => {
        await tor.refresh()
        await route.applyAll()
        return netStatus()
      }
    },
    'favicons.data': { scope: 'both', run: (c, url) => favicons.data(c.controller.session, c.controller.kind, String(url ?? '')) },
    'site.info': { scope: 'shell', run: (c) => siteInfo(c) },
    'site.setShields': {
      scope: 'shell',
      run: (c, on) => {
        const info = siteInfo(c)
        if (!info || info.locked) return info
        sites.setShields(info.host, !!on)
        activeTab(c)?.reload(false)
        return siteInfo(c)
      }
    },
    'site.setCookies': {
      scope: 'shell',
      run: (c, allow) => {
        const info = siteInfo(c)
        if (!info || info.locked) return info
        sites.setCookiesAllowed(info.host, !!allow)
        activeTab(c)?.reload(false)
        return siteInfo(c)
      }
    },
    'site.setPermission': {
      scope: 'shell',
      run: (c, origin, permission, decision) => {
        const info = siteInfo(c)
        if (!info || String(origin) !== info.origin) return info
        if (decision === null) sites.resetPermission(info.origin, String(permission))
        else if (decision === 'allow' || decision === 'block') sites.setPermission(info.origin, String(permission), decision, c.controller.kind === 'normal')
        return siteInfo(c)
      }
    },
    'site.clearData': {
      scope: 'shell',
      run: async (c) => {
        const info = siteInfo(c)
        if (!info) return
        const ses = c.controller.session
        await ses.clearStorageData({ origin: info.origin })
        // cookies of the whole site (they may belong to a parent domain such as .example.com)
        const site = registrableDomain(info.host.replace(/^www\./, ''))
        for (const cookie of await ses.cookies.get({})) {
          const domain = (cookie.domain ?? '').replace(/^\./, '')
          if (domain === site || domain.endsWith(`.${site}`)) {
            const scheme = cookie.secure ? 'https' : 'http'
            await ses.cookies.remove(`${scheme}://${domain}${cookie.path ?? '/'}`, cookie.name).catch(() => undefined)
          }
        }
        activeTab(c)?.reload(true)
      }
    },
    'permissions.list': { scope: 'page', run: () => sites.listPermissions() },
    'permissions.reset': {
      scope: 'page',
      run: (_c, origin, permission) => {
        if (origin) sites.resetPermission(String(origin), permission ? String(permission) : undefined)
        else sites.clear({ permissions: true, exceptions: false })
      }
    },
    'siteRules.list': { scope: 'page', run: () => sites.exceptions() },
    'siteRules.reset': { scope: 'page', run: () => sites.clear({ permissions: false, exceptions: true }) },
    'privacy.fire': {
      scope: 'both',
      run: (c, options) => {
        const o = (options ?? {}) as Partial<FireOptions>
        return manager.fire(
          { tabs: !!o.tabs, history: !!o.history, downloads: !!o.downloads, cookies: !!o.cookies, cache: !!o.cache, permissions: !!o.permissions },
          c.controller
        )
      }
    },
    'favicons.forHosts': { scope: 'page', run: (_c, hosts) => history.faviconsForHosts(Array.isArray(hosts) ? hosts.map(String) : []) },
    'downloads.list': { scope: 'both', run: (c) => downloads.list(c.controller.isPrivate) },
    'downloads.pause': { scope: 'both', run: (_c, id) => downloads.pause(id) },
    'downloads.resume': { scope: 'both', run: (_c, id) => downloads.resume(id) },
    'downloads.cancel': { scope: 'both', run: (_c, id) => downloads.cancel(id) },
    'downloads.retry': { scope: 'both', run: (_c, id) => downloads.retry(id) },
    'downloads.open': { scope: 'both', run: (_c, id) => downloads.open(id) },
    'downloads.show': { scope: 'both', run: (_c, id) => downloads.show(id) },
    'downloads.remove': { scope: 'both', run: (_c, id) => downloads.remove(id) },
    'downloads.clearFinished': { scope: 'both', run: (c) => downloads.clearFinished(c.controller.isPrivate) },

    // ── internal pages ───────────────────────────────────────────────────
    'page.env': {
      scope: 'page',
      run: (c) => ({ isPrivate: c.controller.isPrivate, isTor: c.controller.kind === 'tor', version: app.getVersion(), platform: process.platform })
    },
    'page.navigate': { scope: 'page', run: (c, input, opts) => c.controller.navigateTab(c.sender, String(input), opts?.newTab) },
    'page.allowThreat': { scope: 'page', run: (_c, url) => privacy.allowThreat(String(url)) },
    'page.allowHttp': { scope: 'page', run: (_c, url) => privacy.allowHttp(String(url)) },
    'page.proceedCertificate': { scope: 'page', run: (_c, url) => trustCertificateHost(String(url)) },
    'settings.pickDownloadFolder': {
      scope: 'page',
      run: async (c) => {
        const result = await dialog.showOpenDialog(c.controller.window, {
          title: 'Choose download folder',
          defaultPath: settings.get().downloadPath || paths.defaultDownloads(),
          properties: ['openDirectory', 'createDirectory']
        })
        const folder = result.canceled ? null : (result.filePaths[0] ?? null)
        if (folder) settings.update({ downloadPath: folder, downloadMode: 'custom' })
        return folder
      }
    },
    'settings.pickTorPath': {
      scope: 'page',
      run: async (c) => {
        const result = await dialog.showOpenDialog(c.controller.window, {
          title: 'Choose tor.exe (Tor Expert Bundle)',
          properties: ['openFile'],
          filters: [{ name: 'Tor', extensions: ['exe'] }]
        })
        const file = result.canceled ? null : (result.filePaths[0] ?? null)
        if (file && /(^|[\\/])tor\.exe$/i.test(file)) {
          settings.update({ torPath: file })
          return file
        }
        if (file) throw new Error('That file is not tor.exe')
        return null
      }
    },
    'settings.pickBackground': {
      scope: 'page',
      run: async (c) => {
        const result = await dialog.showOpenDialog(c.controller.window, {
          title: 'Choose a background image',
          properties: ['openFile'],
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }]
        })
        const file = result.canceled ? undefined : result.filePaths[0]
        if (!file) return null
        const { size } = await stat(file)
        if (size > MAX_BACKGROUND_BYTES) throw new Error('Image is larger than 25 MB')
        return setBackgroundFile(file)
      }
    },
    'settings.clearBackground': {
      scope: 'page',
      run: async () => {
        await removeBackgroundFile()
        settings.update({ background: 'default', backgroundImage: null })
      }
    },
    'privacy.clear': { scope: 'page', run: (_c, options) => clearData(options ?? {}) },
    'bookmarks.import': {
      scope: 'page',
      run: async (c) => {
        const result = await dialog.showOpenDialog(c.controller.window, {
          title: 'Import bookmarks',
          properties: ['openFile'],
          filters: [{ name: 'Bookmarks HTML', extensions: ['html', 'htm'] }]
        })
        const file = result.canceled ? undefined : result.filePaths[0]
        if (!file) return 0
        const data = await readFile(file)
        if (data.byteLength > MAX_IMPORT_BYTES) throw new Error('File is too large')
        return bookmarks.importHtml(data.toString('utf8'))
      }
    },
    'bookmarks.export': {
      scope: 'page',
      run: async (c) => {
        const result = await dialog.showSaveDialog(c.controller.window, {
          title: 'Export bookmarks',
          defaultPath: path.join(app.getPath('documents'), 'f2px-bookmarks.html'),
          filters: [{ name: 'Bookmarks HTML', extensions: ['html'] }]
        })
        if (result.canceled || !result.filePath) return false
        await mkdir(path.dirname(result.filePath), { recursive: true })
        await writeFile(result.filePath, bookmarks.exportHtml(), 'utf8')
        return true
      }
    },
    'app.restart': {
      scope: 'page',
      run: () => {
        void settings.flushNow().then(() => {
          app.relaunch()
          app.exit(0)
        })
      }
    }
  }
}

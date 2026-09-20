import { app, session } from 'electron'
import { registerInternalScheme } from './browser/protocol'
import { cleanUserAgent, installCertificateHandling } from './browser/sessionSetup'
import { Omnibox } from './browser/omnibox'
import { SessionStore } from './browser/sessionStore'
import { NORMAL_PARTITION, WindowManager } from './browser/windowManager'
import { BookmarkService } from './bookmarks/bookmarkService'
import { DownloadManager } from './downloads/downloadManager'
import { HistoryService } from './history/historyService'
import { EventHub } from './ipc/eventHub'
import { createHandlers } from './ipc/handlers'
import { registerRpc } from './ipc/rpc'
import { paths } from './paths'
import { PrivacyGuard } from './privacy/privacyGuard'
import { ThreatList } from './privacy/threatList'
import { QuickAccessService } from './quickaccess/quickAccessService'
import { registerSettingsEffects } from './settings/settingsEffects'
import { SettingsService, readBootFlags } from './settings/settingsService'
import type { AppServices } from './services'
import { openStore } from './storage/openStore'
import { askPassword } from './system/lockWindow'
import { createTray } from './system/tray'
import { UpdateChecker } from './system/updateChecker'
import { ensureDir } from './utils/fsUtils'

// Must happen before the app is ready.
registerInternalScheme()
app.setAppUserModelId('com.f2px.browser')
if (process.env['F2PX_USER_DATA']) app.setPath('userData', process.env['F2PX_USER_DATA'])
// Automation hook for end-to-end tests; never set in normal use.
if (process.env['F2PX_DEBUG_PORT']) app.commandLine.appendSwitch('remote-debugging-port', process.env['F2PX_DEBUG_PORT'])

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  main()
}

/** First http(s) URL (or existing file path) passed on the command line. */
function urlFromArgv(argv: string[]): string | undefined {
  return argv.slice(1).find((a) => /^https?:\/\//i.test(a))
}

/** Opt-in: refresh the malware / phishing list about once a day. */
function scheduleThreatUpdates(settings: SettingsService, threats: ThreatList): void {
  const DAY = 24 * 60 * 60 * 1000
  const tick = (): void => {
    if (!settings.get().protectionUpdates) return
    const at = threats.status().updatedAt
    if (threats.status().source === 'updated' && at && Date.now() - Date.parse(at) < DAY) return
    threats.update().catch((error) => console.warn('[threats] update failed', error instanceof Error ? error.message : error))
  }
  setTimeout(tick, 45_000).unref()
  setInterval(tick, 6 * 60 * 60 * 1000).unref()
}

function main(): void {
  // Hardware acceleration can only be switched off before ready, so this one flag is read from a tiny boot file.
  if (!readBootFlags(app.getPath('userData')).hardwareAcceleration) app.disableHardwareAcceleration()
  app.enableSandbox() // every renderer process runs sandboxed, not just the ones we configure explicitly
  app.userAgentFallback = cleanUserAgent(app.userAgentFallback)

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (e) => e.preventDefault())
  })

  let manager: WindowManager | null = null

  app.on('second-instance', (_event, argv) => {
    const url = urlFromArgv(argv)
    if (url) manager?.openUrl(url)
    else manager?.showAny()
  })

  // The password window is a real window: do not treat its closing as "the app has no windows left".
  let started = false
  app.on('window-all-closed', () => {
    if (started) app.quit()
  })

  void app.whenReady().then(async () => {
    ensureDir(paths.userData())
    ensureDir(paths.backgrounds())

    // Encrypted store (asks for the password first when one is set). Cancelled -> quit.
    const store = await openStore(paths.userData(), askPassword)
    if (!store) {
      app.quit()
      return
    }
    const { vault, db } = store
    const settings = new SettingsService(db, paths.userData())
    const hub = new EventHub()
    const history = new HistoryService(db)
    const bookmarks = new BookmarkService(db)
    const quickAccess = new QuickAccessService(db)
    const downloads = new DownloadManager(db, settings, hub)
    const omnibox = new Omnibox(history, bookmarks, settings)
    const threats = new ThreatList(paths.userData())
    const privacy = new PrivacyGuard(db, settings, threats)
    privacy.hasVisited = (host) => history.hasHost(host)
    const updates = new UpdateChecker(settings)
    const services: AppServices = { db, vault, settings, history, bookmarks, quickAccess, downloads, omnibox, privacy, updates, hub }

    const sessionStore = new SessionStore(db)
    manager = new WindowManager(services, sessionStore)
    installCertificateHandling()
    registerRpc(manager, hub, createHandlers(services, manager))
    registerSettingsEffects(services, manager, hub)
    downloads.onStarted = (isPrivate) => hub.emit('shell:open-downloads', undefined, { kind: 'shell', isPrivate })
    createTray(manager)
    updates.schedule()
    scheduleThreatUpdates(settings, threats)

    // "Clear on exit": remember the session first (so nothing is lost if the option is off), then wipe what the user asked for.
    let exitCleaned = false
    app.on('before-quit', (event) => {
      manager?.setQuitting()
      const s = settings.get()
      if (exitCleaned || !(s.clearCookiesOnExit || s.clearHistoryOnExit)) return
      event.preventDefault()
      exitCleaned = true
      void (async () => {
        try {
          if (s.clearHistoryOnExit) {
            history.clear()
            downloads.clearHistory()
            sessionStore.clear()
          }
          if (s.clearCookiesOnExit) {
            const ses = session.fromPartition(NORMAL_PARTITION)
            await ses.clearStorageData()
            await ses.clearCache()
          }
        } catch (error) {
          console.error('[privacy] clear on exit failed', error)
        } finally {
          app.quit()
        }
      })()
    })
    app.on('will-quit', () => {
      privacy.flush()
      void settings.flushNow()
      db.close()
    })

    started = true
    manager.start(urlFromArgv(process.argv))
  })
}

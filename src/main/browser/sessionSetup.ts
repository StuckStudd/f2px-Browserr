import { app, dialog, type BrowserWindow, type Session, type WebContents } from 'electron'
import { hostOf, isInternalUrl } from '../../shared/url'
import type { DownloadManager } from '../downloads/downloadManager'
import type { PrivacyGuard } from '../privacy/privacyGuard'
import type { SettingsService } from '../settings/settingsService'
import { registerInternalProtocol } from './protocol'

export interface SessionDeps {
  settings: SettingsService
  downloads: DownloadManager
  privacy: PrivacyGuard
  parentWindow: (contents: WebContents) => BrowserWindow | undefined
}

/** Makes the UA look like plain Chromium; sites often refuse to work for "Electron/x.y". */
export function cleanUserAgent(ua: string): string {
  return ua.replace(/\s(?:Electron|F2PX[\w.-]*|f2px[\w.-]*)\/[\d.]+/gi, '')
}

const ALWAYS_ALLOWED = new Set([
  'fullscreen',
  'pointerLock',
  'keyboardLock',
  'clipboard-sanitized-write',
  'speaker-selection'
])
const ASK_USER = new Set(['media', 'notifications'])

const configured = new WeakSet<Session>()
/** Hosts for which the user chose "proceed anyway" on a certificate error page. */
const trustedCertificateHosts = new Set<string>()

export function trustCertificateHost(url: string): void {
  const host = hostOf(url)
  if (host) trustedCertificateHosts.add(host)
}

/** Applies the browser's security and privacy policy to a tab session. Idempotent. */
export function configureSession(ses: Session, deps: SessionDeps, isPrivate: boolean): void {
  if (configured.has(ses)) return
  configured.add(ses)

  registerInternalProtocol(ses)
  deps.downloads.attach(ses, isPrivate)
  deps.privacy.attach(ses)
  // Spell check downloads dictionaries from Google servers on Windows, so it stays off unless the user opts in.
  ses.setSpellCheckerEnabled(deps.settings.get().spellcheck)
  deps.settings.onChange.on(({ settings, changed }) => {
    if (changed.includes('spellcheck')) ses.setSpellCheckerEnabled(settings.spellcheck)
  })
  ses.setUserAgent(cleanUserAgent(ses.getUserAgent()))

  // Permissions: deny by default, prompt for camera/mic/notifications, remember per origin for the session.
  const decisions = new Map<string, boolean>()
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    const url = details.requestingUrl || contents.getURL()
    if (isInternalUrl(url) || ALWAYS_ALLOWED.has(permission)) return callback(true)
    if (!ASK_USER.has(permission)) return callback(false)

    let origin: string
    try {
      origin = new URL(url).origin
    } catch {
      return callback(false)
    }
    const key = `${origin}|${permission}`
    const known = decisions.get(key)
    if (known !== undefined) return callback(known)

    const media = (details as { mediaTypes?: string[] }).mediaTypes ?? []
    const what =
      permission === 'media'
        ? media.includes('video') && media.includes('audio')
          ? 'use your camera and microphone'
          : media.includes('video')
            ? 'use your camera'
            : 'use your microphone'
        : 'show notifications'
    const options = {
      type: 'question' as const,
      buttons: ['Block', 'Allow'],
      defaultId: 0,
      cancelId: 0,
      title: 'Site permission',
      message: `${new URL(url).host} wants to ${what}`,
      detail: isPrivate ? 'This permission is forgotten when the private window closes.' : 'You can change this later in the next session.'
    }
    const parent = deps.parentWindow(contents)
    const prompt = parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options)
    void prompt.then(({ response }) => {
      const allowed = response === 1
      decisions.set(key, allowed)
      callback(allowed)
    })
  })
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
    if (ALWAYS_ALLOWED.has(permission)) return true
    if (requestingOrigin.startsWith('f2px:')) return true
    if (ASK_USER.has(permission)) return decisions.get(`${requestingOrigin}|${permission}`) === true
    return false
  })

  // Do Not Track / Global Privacy Control.
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    if (deps.settings.get().doNotTrack) {
      callback({ requestHeaders: { ...details.requestHeaders, DNT: '1', 'Sec-GPC': '1' } })
    } else {
      callback({})
    }
  })
}

/** Certificate errors are blocked (the tab shows the F2PX error page) unless the user opted in for the host. */
export function installCertificateHandling(): void {
  app.on('certificate-error', (event, _contents, url, _error, _certificate, callback) => {
    if (trustedCertificateHosts.has(hostOf(url))) {
      event.preventDefault()
      callback(true)
    } else {
      callback(false)
    }
  })
}

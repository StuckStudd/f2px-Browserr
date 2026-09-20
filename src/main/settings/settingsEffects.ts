import { app, nativeTheme } from 'electron'
import type { WindowManager } from '../browser/windowManager'
import { applySecureDns } from '../privacy/secureDns'
import type { EventHub } from '../ipc/eventHub'
import type { AppServices } from '../services'
import type { Settings } from '../../shared/types'

function applyTheme(theme: Settings['theme']): void {
  nativeTheme.themeSource = theme
}

function applyLoginItem(enabled: boolean): void {
  // In development this would register the bare Electron binary, so only do it for the installed app.
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath })
}

/** Reacts to setting changes: pushes them to every renderer and applies OS-level effects. */
export function registerSettingsEffects(services: AppServices, manager: WindowManager, hub: EventHub): void {
  const { settings, history, bookmarks, quickAccess } = services
  const initial = settings.get()
  applyTheme(initial.theme)
  applySecureDns(initial)
  applyLoginItem(initial.startWithWindows)

  settings.onChange.on(({ settings: next, changed }) => {
    if (changed.includes('theme')) applyTheme(next.theme)
    if (changed.some((k) => k === 'secureDns' || k === 'dnsProvider' || k === 'dnsCustomUrl')) applySecureDns(next)
    if (changed.includes('startWithWindows')) applyLoginItem(next.startWithWindows)
    if (changed.some((k) => k === 'theme' || k === 'compactMode' || k === 'showBookmarksBar')) manager.relayoutAll()
    hub.emit('settings:changed', next)
  })

  // The window frame colours follow the OS theme when the user picked "system".
  nativeTheme.on('updated', () => manager.relayoutAll())

  history.onChange.on(() => hub.emit('history:changed', undefined, { kind: 'page' }))
  bookmarks.onChange.on(() => hub.emit('bookmarks:changed'))
  quickAccess.onChange.on(() => hub.emit('quickAccess:changed', undefined, { kind: 'page' }))
}

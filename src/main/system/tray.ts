import { Menu, Tray, app, nativeImage } from 'electron'
import type { WindowManager } from '../browser/windowManager'
import { paths } from '../paths'

/** System tray icon: keeps F2PX reachable when its windows are hidden. */
export function createTray(manager: WindowManager): Tray {
  const icon = nativeImage.createFromPath(paths.resource('tray.png'))
  const tray = new Tray(icon)
  tray.setToolTip('F2PX Browser')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open F2PX', click: () => manager.showAny() },
      { label: 'New window', click: () => manager.createWindow({ isPrivate: false }) },
      { label: 'New private window', click: () => manager.createWindow({ isPrivate: true }) },
      { type: 'separator' },
      { label: 'Downloads', click: () => manager.openPage('downloads') },
      { type: 'separator' },
      { label: 'Quit F2PX', click: () => app.quit() }
    ])
  )
  tray.on('click', () => manager.showAny())
  return tray
}

import { app } from 'electron'
import path from 'node:path'

/** Filesystem locations used by the main process. Resolved lazily so they work before `ready`. */
export const paths = {
  userData: (): string => app.getPath('userData'),
  database: (): string => path.join(app.getPath('userData'), 'f2px.db'),
  backgrounds: (): string => path.join(app.getPath('userData'), 'backgrounds'),
  /** Built renderer bundles (index.html = browser chrome, internal.html = f2px:// pages). */
  rendererRoot: (): string => path.join(__dirname, '../renderer'),
  preload: (): string => path.join(__dirname, '../preload/index.js'),
  /** Session preload that runs in every frame of every web page (fingerprint shield, element hiding). */
  shieldPreload: (): string => path.join(__dirname, '../preload/shield.js'),
  defaultDownloads: (): string => path.join(app.getPath('downloads'), 'F2PX'),
  /** Icons: `build/` in development, `resources/` inside the packaged app. */
  resource: (file: string): string =>
    app.isPackaged ? path.join(process.resourcesPath, file) : path.join(app.getAppPath(), 'build', file)
}

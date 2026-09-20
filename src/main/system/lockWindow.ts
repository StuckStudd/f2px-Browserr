import { BrowserWindow, ipcMain, session } from 'electron'
import { registerInternalProtocol } from '../browser/protocol'
import { paths } from '../paths'
import type { UnlockResult } from '../storage/openStore'
import type { Vault } from '../storage/vault'

const UNLOCK_CHANNEL = 'f2px:unlock'
const RESET_CHANNEL = 'f2px:unlock-reset'
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Small window shown at startup when the user protected F2PX with a password. */
export function askPassword(vault: Vault): Promise<UnlockResult> {
  registerInternalProtocol(session.defaultSession)

  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 440,
      height: 540,
      resizable: false,
      maximizable: false,
      minimizable: false,
      show: false,
      title: 'F2PX Browser',
      backgroundColor: '#050505',
      icon: paths.resource('icon.ico'),
      autoHideMenuBar: true,
      webPreferences: {
        preload: paths.preload(),
        additionalArguments: ['--f2px-unlock'],
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    win.removeMenu()

    let finished = false
    let attempts = 0
    const finish = (result: UnlockResult): void => {
      if (finished) return
      finished = true
      ipcMain.removeHandler(UNLOCK_CHANNEL)
      ipcMain.removeHandler(RESET_CHANNEL)
      resolve(result)
      // Let the IPC reply reach the page before the window disappears.
      setTimeout(() => {
        if (!win.isDestroyed()) win.destroy()
      }, 150)
    }
    const trusted = (event: Electron.IpcMainInvokeEvent): boolean =>
      event.sender === win.webContents && (event.senderFrame?.url ?? '').startsWith('f2px://unlock')

    ipcMain.handle(UNLOCK_CHANNEL, async (event, password: unknown) => {
      if (!trusted(event) || typeof password !== 'string') throw new Error('Unauthorized caller')
      attempts++
      await delay(Math.min(attempts * 400, 4000)) // slows down guessing
      if (vault.unlockPassword(password)) {
        finish('unlocked')
        return true
      }
      return false
    })
    ipcMain.handle(RESET_CHANNEL, (event) => {
      if (!trusted(event)) throw new Error('Unauthorized caller')
      finish('reset')
      return true
    })

    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    win.once('ready-to-show', () => win.show())
    win.on('closed', () => finish('cancel'))
    void win.loadURL('f2px://unlock')
  })
}

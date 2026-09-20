import { contextBridge, ipcRenderer } from 'electron'
import { EVENT_CHANNEL, RPC_CHANNEL, type EventMap, type EventName, type RpcMethod } from '../shared/ipc'

/**
 * Single sandbox-safe preload for both the browser shell and every tab.
 *  - shell view (started with --f2px-shell)  -> window.f2pxShell
 *  - f2px:// documents                        -> window.f2px
 *  - any other web page                       -> nothing is exposed
 * The main process authenticates every call again by sender, so exposure is only a convenience.
 */
const bridge = {
  rpc: (method: RpcMethod, ...args: unknown[]): Promise<unknown> => ipcRenderer.invoke(RPC_CHANNEL, method, args),
  on: <E extends EventName>(name: E, callback: (payload: EventMap[E]) => void): (() => void) => {
    const listener = (_e: unknown, event: string, payload: EventMap[E]): void => {
      if (event === name) callback(payload)
    }
    ipcRenderer.on(EVENT_CHANNEL, listener)
    return () => ipcRenderer.removeListener(EVENT_CHANNEL, listener)
  }
}

const { protocol } = (globalThis as unknown as { location: { protocol: string } }).location

if (process.argv.includes('--f2px-unlock')) {
  // Startup password window: talks to the main process through two dedicated channels only.
  if (protocol === 'f2px:') {
    contextBridge.exposeInMainWorld('f2pxUnlock', {
      submit: (password: string): Promise<boolean> => ipcRenderer.invoke('f2px:unlock', password),
      reset: (): Promise<boolean> => ipcRenderer.invoke('f2px:unlock-reset')
    })
  }
} else if (process.argv.includes('--f2px-shell')) {
  contextBridge.exposeInMainWorld('f2pxShell', bridge)
  ipcRenderer.send('f2px:subscribe')
} else if (protocol === 'f2px:') {
  contextBridge.exposeInMainWorld('f2px', bridge)
  ipcRenderer.send('f2px:subscribe')
}

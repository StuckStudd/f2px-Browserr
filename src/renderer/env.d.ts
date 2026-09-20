/// <reference types="vite/client" />

import type { EventMap, EventName } from '@shared/ipc'

interface Bridge {
  rpc(method: string, ...args: unknown[]): Promise<unknown>
  on<E extends EventName>(name: E, callback: (payload: EventMap[E]) => void): () => void
}

declare global {
  /** Injected at build time from package.json. */
  const __APP_VERSION__: string

  interface Window {
    /** Exposed by the shell preload (browser chrome only). */
    f2pxShell?: Bridge
    /** Exposed by the page preload to f2px:// pages only. */
    f2px?: Bridge
  }
}

export {}

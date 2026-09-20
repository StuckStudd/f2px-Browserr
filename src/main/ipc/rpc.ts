import { ipcMain, type WebContents } from 'electron'
import { RPC_CHANNEL, type RpcMethod, type RpcMethods } from '../../shared/ipc'
import { isInternalUrl } from '../../shared/url'
import type { WindowController } from '../browser/windowController'
import type { WindowManager } from '../browser/windowManager'
import type { EventHub } from './eventHub'

export type Scope = 'shell' | 'page' | 'both'

export interface RpcContext {
  sender: WebContents
  kind: 'shell' | 'page'
  controller: WindowController
}

type Handler<M extends RpcMethod> = (
  ctx: RpcContext,
  ...args: Parameters<RpcMethods[M]>
) => ReturnType<RpcMethods[M]> | Promise<Awaited<ReturnType<RpcMethods[M]>>>

/** Every RPC method must be implemented (the type is exhaustive) and declares who may call it. */
export type RpcTable = { [M in RpcMethod]: { scope: Scope; run: Handler<M> } }

/**
 * The single entry point renderers use to reach the main process. Callers are authenticated by
 * the webContents they come from (never by anything they claim), and f2px:// pages are only
 * trusted while they are actually showing an f2px:// document in their main frame.
 */
export function registerRpc(manager: WindowManager, hub: EventHub, table: RpcTable): void {
  ipcMain.handle(RPC_CHANNEL, async (event, method: unknown, args: unknown) => {
    const owner = manager.ownerOf(event.sender)
    const isMainFrame = event.senderFrame === event.sender.mainFrame
    if (!owner || !isMainFrame) throw new Error('Unauthorized caller')
    if (owner.kind === 'page' && !isInternalUrl(event.senderFrame?.url ?? '')) {
      throw new Error('Unauthorized caller')
    }

    const entry = typeof method === 'string' ? (table as Record<string, RpcTable[RpcMethod]>)[method] : undefined
    if (!entry || !Object.prototype.hasOwnProperty.call(table, method as string)) throw new Error(`Unknown method: ${String(method)}`)
    if (entry.scope !== 'both' && entry.scope !== owner.kind) throw new Error(`Method not allowed: ${String(method)}`)

    const ctx: RpcContext = { sender: event.sender, kind: owner.kind, controller: owner.controller }
    const params = Array.isArray(args) ? args : []
    try {
      return await (entry.run as (c: RpcContext, ...a: unknown[]) => unknown)(ctx, ...params)
    } catch (error) {
      console.error(`[rpc] ${String(method)} failed`, error)
      throw error instanceof Error ? error : new Error(String(error))
    }
  })

  ipcMain.on('f2px:subscribe', (event) => {
    const owner = manager.ownerOf(event.sender)
    if (owner) hub.subscribe(event.sender, owner.kind)
  })
}

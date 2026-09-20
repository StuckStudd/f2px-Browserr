import type { EventMap, EventName, RpcMethods } from '@shared/ipc'

function bridge() {
  const b = window.f2pxShell ?? window.f2px
  if (!b) throw new Error('F2PX bridge is not available in this context')
  return b
}

type Args<M extends keyof RpcMethods> = Parameters<RpcMethods[M]>
type Result<M extends keyof RpcMethods> = Awaited<ReturnType<RpcMethods[M]>>

/** Typed call into the main process. */
export function call<M extends keyof RpcMethods>(method: M, ...args: Args<M>): Promise<Result<M>> {
  return bridge().rpc(method, ...args) as Promise<Result<M>>
}

/** Fire-and-forget variant for UI actions where a failure should not break rendering. */
export function fire<M extends keyof RpcMethods>(method: M, ...args: Args<M>): void {
  call(method, ...args).catch((error) => console.error(`[rpc] ${method}`, error))
}

export function subscribe<E extends EventName>(name: E, callback: (payload: EventMap[E]) => void): () => void {
  return bridge().on(name, callback)
}

import { session, type Session } from 'electron'
import type { NetworkRoute } from './route'

/**
 * Every request the main process makes itself (site icons, list updates, update checks, search suggestions) goes through
 * this session, so it follows the same proxy / Tor route as the windows — never around it.
 */
const PARTITION = 'f2px-net'
let netSession: Session | null = null

export function initNetSession(route: NetworkRoute): Session {
  netSession = session.fromPartition(PARTITION)
  netSession.setSpellCheckerEnabled(false)
  void route.configure(netSession, 'net')
  return netSession
}

export async function netFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!netSession) throw new Error('The network is not ready yet')
  return netSession.fetch(url, { credentials: 'omit', ...init })
}

/** Text download with a size cap and a timeout. */
export async function fetchText(url: string, options: { timeoutMs?: number; maxBytes?: number; accept?: string } = {}): Promise<string> {
  const res = await netFetch(url, {
    signal: AbortSignal.timeout(options.timeoutMs ?? 90_000),
    headers: options.accept ? { Accept: options.accept } : undefined
  })
  if (!res.ok) throw new Error(`Could not download ${new URL(url).hostname} (HTTP ${res.status})`)
  const max = options.maxBytes ?? 40 * 1024 * 1024
  if (Number(res.headers.get('content-length') ?? 0) > max) throw new Error('The download is unexpectedly large')
  const text = await res.text()
  if (text.length > max) throw new Error('The download is unexpectedly large')
  return text
}

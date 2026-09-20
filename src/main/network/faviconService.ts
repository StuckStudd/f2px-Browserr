import type { Session } from 'electron'

const MAX_BYTES = 128 * 1024
const MAX_ENTRIES = 600
const MAX_TOTAL_BYTES = 8 * 1024 * 1024
const MAX_PARALLEL = 6
const FAILURE_TTL_MS = 10 * 60 * 1000

interface Entry {
  value: string | null
  at: number
}

/**
 * Site icons are fetched here, by the main process, through the session of the window that asked — so they follow that
 * window's proxy / Tor route, carry no cookies and no Referer, and the browser's own UI never has to touch the network.
 */
export class FaviconService {
  private readonly cache = new Map<string, Entry>()
  private readonly pending = new Map<string, Promise<string | null>>()
  private totalBytes = 0
  private active = 0
  private readonly queue: Array<() => void> = []

  data(ses: Session, kind: string, url: string): Promise<string | null> {
    if (url.startsWith('data:image/')) return Promise.resolve(url.length <= MAX_BYTES * 2 ? url : null)
    if (!/^https?:\/\//i.test(url) || url.length > 2000) return Promise.resolve(null)

    const key = `${kind}|${url}`
    const hit = this.cache.get(key)
    if (hit && (hit.value !== null || Date.now() - hit.at < FAILURE_TTL_MS)) {
      // refresh recency
      this.cache.delete(key)
      this.cache.set(key, hit)
      return Promise.resolve(hit.value)
    }
    const running = this.pending.get(key)
    if (running) return running

    const job = this.limited(() => this.download(ses, url))
      .then((value) => {
        this.cache.set(key, { value, at: Date.now() })
        this.totalBytes += value?.length ?? 0
        // oldest entries go first, by count and by size
        while (this.cache.size > MAX_ENTRIES || this.totalBytes > MAX_TOTAL_BYTES) {
          const oldest = this.cache.keys().next().value as string | undefined
          if (oldest === undefined) break
          this.totalBytes -= this.cache.get(oldest)?.value?.length ?? 0
          this.cache.delete(oldest)
        }
        return value
      })
      .finally(() => this.pending.delete(key))
    this.pending.set(key, job)
    return job
  }

  clear(): void {
    this.cache.clear()
    this.totalBytes = 0
  }

  private async limited<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= MAX_PARALLEL) await new Promise<void>((resolve) => this.queue.push(resolve))
    this.active++
    try {
      return await task()
    } finally {
      this.active--
      this.queue.shift()?.()
    }
  }

  private async download(ses: Session, url: string): Promise<string | null> {
    try {
      const res = await ses.fetch(url, {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: { Accept: 'image/*' },
        signal: AbortSignal.timeout(7000)
      })
      if (!res.ok) return null
      if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) return null
      const body = Buffer.from(await res.arrayBuffer())
      if (body.length === 0 || body.length > MAX_BYTES) return null
      let type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      if (!type.startsWith('image/')) {
        // servers often label .ico files as octet-stream
        if (/\.ico(?:$|\?)/i.test(url) && (type === '' || type === 'application/octet-stream')) type = 'image/x-icon'
        else return null
      }
      return `data:${type};base64,${body.toString('base64')}`
    } catch {
      return null
    }
  }
}

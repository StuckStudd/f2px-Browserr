import fs from 'node:fs'
import path from 'node:path'
import { app, net } from 'electron'
import { paths } from '../paths'

import { encodeHosts, hashHost, parseHosts } from './threatHash'

export interface ThreatListStatus {
  entries: number
  source: 'bundled' | 'updated'
  /** ISO date of the data (build date of the bundled list, or the time of the last download). */
  updatedAt: string | null
}

const SOURCES = [
  'https://urlhaus.abuse.ch/downloads/hostfile/',
  'https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt'
]
const MAX_DOWNLOAD_BYTES = 40 * 1024 * 1024

export class ThreatList {
  private data: Float64Array<ArrayBufferLike> = new Float64Array(0)
  private extra = new Set<string>()
  private info: ThreatListStatus = { entries: 0, source: 'bundled', updatedAt: null }
  private readonly updatedBin: string
  private readonly updatedMeta: string

  constructor(userData: string) {
    this.updatedBin = path.join(userData, 'threats.bin')
    this.updatedMeta = path.join(userData, 'threats.meta.json')
    this.load()
    // Test hook: extra hosts treated as dangerous (never used in a packaged build).
    const hook = process.env['F2PX_TEST_THREAT_HOSTS']
    if (hook && !app.isPackaged) hook.split(',').forEach((h) => this.extra.add(h.trim().toLowerCase()))
  }

  private readBin(file: string): Float64Array | null {
    try {
      const buf = fs.readFileSync(file)
      if (buf.byteLength === 0 || buf.byteLength % 8 !== 0) return null
      return new Float64Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    } catch {
      return null
    }
  }

  private readMeta(file: string): { generatedAt?: string; updatedAt?: string } {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      return {}
    }
  }

  private load(): void {
    const bundled = this.readBin(paths.resource('threats.bin'))
    const bundledMeta = this.readMeta(paths.resource('threats.meta.json'))
    const updated = this.readBin(this.updatedBin)
    const updatedMeta = this.readMeta(this.updatedMeta)
    const bundledAt = bundledMeta.generatedAt ?? null
    // A downloaded list wins only while it is newer than the one shipped with this version.
    if (updated && updatedMeta.updatedAt && (!bundledAt || updatedMeta.updatedAt > bundledAt)) {
      this.data = updated
      this.info = { entries: updated.length, source: 'updated', updatedAt: updatedMeta.updatedAt }
    } else if (bundled) {
      this.data = bundled
      this.info = { entries: bundled.length, source: 'bundled', updatedAt: bundledAt }
    }
  }

  status(): ThreatListStatus {
    return { ...this.info }
  }

  /** True when `host` or one of its parent domains is on the list. */
  has(host: string): boolean {
    let h = host.toLowerCase().replace(/\.$/, '')
    while (h.includes('.')) {
      if (this.extra.has(h) || this.contains(hashHost(h))) return true
      h = h.slice(h.indexOf('.') + 1)
    }
    return false
  }

  private contains(hash: number): boolean {
    const d = this.data
    let lo = 0
    let hi = d.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      const v = d[mid]
      if (v === hash) return true
      if (v < hash) lo = mid + 1
      else hi = mid - 1
    }
    return false
  }

  /** Opt-in refresh from the two open sources. Rejects suspiciously small results instead of weakening protection. */
  async update(): Promise<ThreatListStatus> {
    const all = new Set<string>()
    for (const url of SOURCES) {
      const res = await net.fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(90_000) })
      if (!res.ok) throw new Error(`Could not download ${new URL(url).hostname} (HTTP ${res.status})`)
      const declared = Number(res.headers.get('content-length') ?? 0)
      if (declared > MAX_DOWNLOAD_BYTES) throw new Error('List is unexpectedly large')
      const text = await res.text()
      if (text.length > MAX_DOWNLOAD_BYTES) throw new Error('List is unexpectedly large')
      for (const h of parseHosts(text)) all.add(h)
    }
    const data = encodeHosts(all)
    if (data.length < 1000 || data.length < this.data.length * 0.5) throw new Error('Downloaded list looks incomplete, keeping the current one')
    const tmp = `${this.updatedBin}.tmp`
    fs.writeFileSync(tmp, Buffer.from(data.buffer, data.byteOffset, data.byteLength))
    fs.renameSync(tmp, this.updatedBin)
    fs.writeFileSync(this.updatedMeta, JSON.stringify({ updatedAt: new Date().toISOString(), count: data.length }))
    this.data = data
    this.info = { entries: data.length, source: 'updated', updatedAt: new Date().toISOString() }
    return this.status()
  }
}

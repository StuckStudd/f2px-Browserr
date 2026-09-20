import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import type { FilterListStatus } from '../../shared/types'
import { paths } from '../paths'
import { FilterEngine } from './filterEngine'
import sources from './filterSources.json'

/** Lines are parsed in slices so the main process keeps serving the UI while the lists load. */
const SLICE_LINES = 12_000
const MAX_DOWNLOAD_BYTES = 40 * 1024 * 1024
const READY_TIMEOUT_MS = 4000

export type Fetcher = (url: string) => Promise<string>

interface Meta {
  generatedAt?: string
  updatedAt?: string
  rules?: number
}

/**
 * The content-blocking lists (EasyList, EasyPrivacy, uBlock filters, RU AdList). A snapshot ships with the app so blocking works
 * offline from the first request; refreshing them is opt-in because it contacts the list servers.
 */
export class FilterLists {
  engine = new FilterEngine()
  private info: FilterListStatus = { networkRules: 0, cosmeticRules: 0, ready: false, source: 'bundled', updatedAt: null }
  private readyPromise: Promise<void>
  private readonly updatedFile: string
  private readonly updatedMeta: string

  constructor(
    userData: string,
    private readonly fetcher: Fetcher
  ) {
    this.updatedFile = path.join(userData, 'filters.txt.gz')
    this.updatedMeta = path.join(userData, 'filters.meta.json')
    this.readyPromise = this.load().catch((error) => {
      console.warn('[filters] could not load the lists', error instanceof Error ? error.message : error)
    })
  }

  get ready(): boolean {
    return this.info.ready
  }

  /** Resolves when the lists are parsed — or after a few seconds, so a slow start never blocks browsing. */
  whenReady(): Promise<void> {
    if (this.info.ready) return Promise.resolve()
    return Promise.race([this.readyPromise, new Promise<void>((resolve) => setTimeout(resolve, READY_TIMEOUT_MS).unref())])
  }

  status(): FilterListStatus {
    return { ...this.info }
  }

  private readMeta(file: string): Meta {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as Meta
    } catch {
      return {}
    }
  }

  private async load(): Promise<void> {
    const bundledMeta = this.readMeta(paths.resource('filters.meta.json'))
    const updatedMeta = this.readMeta(this.updatedMeta)
    const bundledAt = bundledMeta.generatedAt ?? null
    const useUpdated = !!updatedMeta.updatedAt && fs.existsSync(this.updatedFile) && (!bundledAt || updatedMeta.updatedAt > bundledAt)

    let raw: Buffer | null = null
    let source: FilterListStatus['source'] = 'bundled'
    let updatedAt = bundledAt
    if (useUpdated) {
      try {
        raw = fs.readFileSync(this.updatedFile)
        source = 'updated'
        updatedAt = updatedMeta.updatedAt ?? null
      } catch {
        raw = null
      }
    }
    if (!raw) {
      try {
        raw = fs.readFileSync(paths.resource('filters.txt.gz'))
        source = 'bundled'
        updatedAt = bundledAt
      } catch {
        raw = null
      }
    }
    if (!raw) {
      // nothing bundled (development checkout): behave as "loaded, no rules" instead of holding requests back
      this.info = { ...this.info, ready: true }
      return
    }

    const engine = await parseInSlices(zlib.gunzipSync(raw).toString('utf8'))
    this.engine = engine
    this.info = { networkRules: engine.stats.network, cosmeticRules: engine.stats.cosmetic, ready: true, source, updatedAt }
  }

  /** Downloads every list, checks the result looks sane and switches to it. */
  async update(): Promise<FilterListStatus> {
    const seen = new Set<string>()
    const lines: string[] = []
    for (const source of sources) {
      const text = await this.fetcher(source.url)
      if (text.length > MAX_DOWNLOAD_BYTES) throw new Error(`${source.name} is unexpectedly large`)
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim()
        if (!line || line.startsWith('!') || line.length > 1000) continue
        const entry = `${source.tag}\t${line}`
        if (seen.has(entry)) continue
        seen.add(entry)
        lines.push(entry)
      }
    }
    if (lines.length < 50_000 || lines.length < this.info.networkRules * 0.5) {
      throw new Error('Downloaded lists look incomplete, keeping the current ones')
    }
    const body = lines.join('\n')
    const tmp = `${this.updatedFile}.tmp`
    fs.writeFileSync(tmp, zlib.gzipSync(Buffer.from(body, 'utf8'), { level: 6 }))
    fs.renameSync(tmp, this.updatedFile)
    const updatedAt = new Date().toISOString()
    fs.writeFileSync(this.updatedMeta, JSON.stringify({ updatedAt, rules: lines.length }))

    const engine = await parseInSlices(body)
    this.engine = engine
    this.info = { networkRules: engine.stats.network, cosmeticRules: engine.stats.cosmetic, ready: true, source: 'updated', updatedAt }
    return this.status()
  }
}

async function parseInSlices(text: string): Promise<FilterEngine> {
  const engine = new FilterEngine()
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += SLICE_LINES) {
    const end = Math.min(lines.length, i + SLICE_LINES)
    for (let k = i; k < end; k++) {
      const line = lines[k]
      const tab = line.indexOf('\t')
      // "<tag>\t<rule>" (bundled / downloaded format); bare lines are accepted too
      if (tab > 0 && tab < 3) engine.addLine(line.slice(tab + 1), Number(line.slice(0, tab)) || 0)
      else engine.addLine(line)
    }
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
  engine.finish()
  return engine
}

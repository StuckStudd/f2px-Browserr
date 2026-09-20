import { app } from 'electron'
import { netFetch } from '../network/netSession'
import type { UpdateStatus } from '../../shared/types'
import type { SettingsService } from '../settings/settingsService'
import { isNewerVersion } from './version'

/** Feed URL baked in at build time from package.json ("f2px.updateFeed"). Empty = update checks are not configured. */
declare const __UPDATE_FEED__: string

const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000
const MAX_FEED_BYTES = 20 * 1024

/**
 * Update *notification*: asks a small JSON feed ({ "version": "1.0.1", "url": "https://…", "notes": "…" }) whether a
 * newer F2PX exists. It never downloads or runs anything: the user opens the download page and installs it themselves,
 * so a compromised feed cannot make the browser execute code.
 */
export class UpdateChecker {
  private state: UpdateStatus
  private timer: NodeJS.Timeout | undefined

  constructor(private readonly settings: SettingsService) {
    this.state = { state: this.feedUrl() ? 'idle' : 'unconfigured', current: app.getVersion() }
  }

  private feedUrl(): string {
    // Unpackaged builds may point at a local feed (used by automated tests only).
    if (!app.isPackaged && process.env['F2PX_UPDATE_FEED']) return process.env['F2PX_UPDATE_FEED']
    return typeof __UPDATE_FEED__ === 'string' ? __UPDATE_FEED__ : ''
  }

  status(): UpdateStatus {
    return { ...this.state }
  }

  /** Starts the periodic check when the user has enabled it. */
  schedule(): void {
    const tick = (): void => {
      if (this.settings.get().checkUpdates) void this.check().catch(() => undefined)
    }
    setTimeout(tick, 30_000).unref()
    this.timer = setInterval(tick, CHECK_INTERVAL_MS)
    this.timer.unref()
  }

  async check(): Promise<UpdateStatus> {
    const feed = this.feedUrl()
    const current = app.getVersion()
    if (!feed) {
      this.state = { state: 'unconfigured', current }
      return this.status()
    }
    try {
      const res = await netFetch(feed, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`Update server answered HTTP ${res.status}`)
      const text = await res.text()
      if (text.length > MAX_FEED_BYTES) throw new Error('Update feed is unexpectedly large')
      const data = JSON.parse(text) as { version?: unknown; url?: unknown; notes?: unknown }
      const version = typeof data.version === 'string' ? data.version : ''
      const url = typeof data.url === 'string' && /^https:\/\//.test(data.url) ? data.url : undefined
      if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Update feed has no valid version')
      const checkedAt = new Date().toISOString()
      this.state = isNewerVersion(version, current)
        ? { state: 'available', current, latest: version, url, notes: typeof data.notes === 'string' ? data.notes.slice(0, 300) : undefined, checkedAt }
        : { state: 'uptodate', current, latest: version, checkedAt }
    } catch (error) {
      this.state = { state: 'error', current, error: error instanceof Error ? error.message : 'Could not check for updates' }
    }
    return this.status()
  }
}

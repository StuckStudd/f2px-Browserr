import type { PageReport } from '../../shared/types'
import type { Database } from '../storage/database'
import { newReport } from './policy'

const KEY = 'privacyCounters'
const LEGACY_KEY = 'blockedTotal'

/** How much the shield has done: lifetime totals (stored) and since this run started. Counts only — never which sites. */
export class PrivacyCounters {
  readonly total: PageReport
  readonly session: PageReport = newReport()
  private dirty = false

  constructor(private readonly db: Database) {
    const stored = db.getKv<Partial<PageReport>>(KEY)
    this.total = { ...newReport() }
    if (stored && typeof stored === 'object') {
      for (const k of Object.keys(this.total) as (keyof PageReport)[]) {
        const v = stored[k]
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) this.total[k] = v
      }
    } else {
      // carry over the tracker counter of earlier versions
      const legacy = db.getKv<number>(LEGACY_KEY)
      if (typeof legacy === 'number' && legacy > 0) this.total.trackers = legacy
    }
    const timer = setInterval(() => this.flush(), 10_000)
    timer.unref()
  }

  add(kind: keyof PageReport): void {
    this.total[kind]++
    this.session[kind]++
    this.dirty = true
  }

  /** Everything that was stopped (ads, trackers, beacons, dangerous resources), kept for the single "blocked so far" number. */
  blockedTotal(): number {
    return this.total.trackers + this.total.ads + this.total.pings + this.total.threats
  }

  reset(): void {
    for (const k of Object.keys(this.total) as (keyof PageReport)[]) {
      this.total[k] = 0
      this.session[k] = 0
    }
    this.dirty = true
    this.flush()
  }

  flush(): void {
    if (!this.dirty) return
    this.dirty = false
    try {
      this.db.setKv(KEY, this.total)
    } catch {
      /* counters are cosmetic */
    }
  }
}

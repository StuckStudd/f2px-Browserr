import type { SitePermission } from '../../shared/types'
import type { Database } from '../storage/database'
import { Emitter } from '../utils/emitter'
import { registrableDomain } from './hosts'

const RULES_KEY = 'siteRules'
const PERMISSIONS_KEY = 'sitePermissions'

interface SiteEntry {
  /** The user turned the shield off for this site. */
  shieldsOff?: true
  /** The user allows third-party cookies while on this site. */
  cookies?: true
}

type Decision = 'allow' | 'block'

const MAX_SITES = 2000

/**
 * What the user decided for individual sites: shield exceptions (per registrable domain) and remembered permission answers
 * (per origin). Kept in the encrypted vault. Private and Tor windows keep their permission answers in memory only.
 */
export class SiteRules {
  readonly onChange = new Emitter<void>()
  private sites: Record<string, SiteEntry>
  private permissions: Record<string, Record<string, Decision>>
  /** Answers given in private / Tor windows: gone when the app closes. */
  private readonly ephemeral = new Map<string, Decision>()

  constructor(private readonly db: Database) {
    this.sites = sanitizeSites(db.getKv<unknown>(RULES_KEY))
    this.permissions = sanitizePermissions(db.getKv<unknown>(PERMISSIONS_KEY))
  }

  static siteOf(host: string): string {
    return registrableDomain(host.replace(/^www\./, ''))
  }

  // ── shields ─────────────────────────────────────────────────────────────
  shieldsOff(host: string): boolean {
    return this.sites[SiteRules.siteOf(host)]?.shieldsOff === true
  }

  cookiesAllowed(host: string): boolean {
    return this.sites[SiteRules.siteOf(host)]?.cookies === true
  }

  setShields(host: string, on: boolean): void {
    this.patchSite(host, { shieldsOff: on ? undefined : true })
  }

  setCookiesAllowed(host: string, allowed: boolean): void {
    this.patchSite(host, { cookies: allowed ? true : undefined })
  }

  private patchSite(host: string, patch: Partial<SiteEntry>): void {
    const site = SiteRules.siteOf(host)
    if (!site) return
    const next: SiteEntry = { ...this.sites[site] }
    for (const key of Object.keys(patch) as (keyof SiteEntry)[]) {
      if (patch[key] === undefined) delete next[key]
      else (next as Record<string, unknown>)[key] = patch[key]
    }
    if (Object.keys(next).length === 0) delete this.sites[site]
    else if (Object.keys(this.sites).length < MAX_SITES || this.sites[site]) this.sites[site] = next
    this.db.setKv(RULES_KEY, this.sites)
    this.onChange.emit()
  }

  exceptions(): { site: string; shieldsOff: boolean; cookies: boolean }[] {
    return Object.entries(this.sites).map(([site, e]) => ({ site, shieldsOff: !!e.shieldsOff, cookies: !!e.cookies }))
  }

  // ── permissions ─────────────────────────────────────────────────────────
  permission(origin: string, permission: string, persistent: boolean): Decision | undefined {
    if (!persistent) return this.ephemeral.get(`${origin}|${permission}`)
    return this.permissions[origin]?.[permission] ?? this.ephemeral.get(`${origin}|${permission}`)
  }

  setPermission(origin: string, permission: string, decision: Decision, persistent: boolean): void {
    if (!persistent) {
      this.ephemeral.set(`${origin}|${permission}`, decision)
      return
    }
    const entry = (this.permissions[origin] ??= {})
    entry[permission] = decision
    this.db.setKv(PERMISSIONS_KEY, this.permissions)
    this.onChange.emit()
  }

  resetPermission(origin: string, permission?: string): void {
    const entry = this.permissions[origin]
    if (entry) {
      if (permission) delete entry[permission]
      else delete this.permissions[origin]
      if (entry && Object.keys(entry).length === 0) delete this.permissions[origin]
      this.db.setKv(PERMISSIONS_KEY, this.permissions)
    }
    for (const key of [...this.ephemeral.keys()]) {
      if (key.startsWith(`${origin}|`) && (!permission || key === `${origin}|${permission}`)) this.ephemeral.delete(key)
    }
    this.onChange.emit()
  }

  listPermissions(originFilter?: (origin: string) => boolean): SitePermission[] {
    const out: SitePermission[] = []
    for (const [origin, entry] of Object.entries(this.permissions)) {
      if (originFilter && !originFilter(origin)) continue
      for (const [permission, decision] of Object.entries(entry)) out.push({ origin, permission, decision })
    }
    return out.sort((a, b) => a.origin.localeCompare(b.origin) || a.permission.localeCompare(b.permission))
  }

  /** Forgets remembered permission answers (and, optionally, the shield exceptions). */
  clear(options: { permissions: boolean; exceptions: boolean }): void {
    if (options.permissions) {
      this.permissions = {}
      this.ephemeral.clear()
      this.db.setKv(PERMISSIONS_KEY, this.permissions)
    }
    if (options.exceptions) {
      this.sites = {}
      this.db.setKv(RULES_KEY, this.sites)
    }
    this.onChange.emit()
  }
}

function sanitizeSites(input: unknown): Record<string, SiteEntry> {
  const out: Record<string, SiteEntry> = {}
  if (typeof input !== 'object' || input === null) return out
  for (const [site, value] of Object.entries(input)) {
    if (!/^[a-z0-9.\-:[\]]{1,253}$/.test(site) || typeof value !== 'object' || value === null) continue
    const v = value as Record<string, unknown>
    const entry: SiteEntry = {}
    if (v['shieldsOff'] === true) entry.shieldsOff = true
    if (v['cookies'] === true) entry.cookies = true
    if (Object.keys(entry).length > 0) out[site] = entry
  }
  return out
}

function sanitizePermissions(input: unknown): Record<string, Record<string, Decision>> {
  const out: Record<string, Record<string, Decision>> = {}
  if (typeof input !== 'object' || input === null) return out
  for (const [origin, value] of Object.entries(input)) {
    if (!/^https?:\/\/[^\s/]{1,260}$/.test(origin) || typeof value !== 'object' || value === null) continue
    const entry: Record<string, Decision> = {}
    for (const [permission, decision] of Object.entries(value)) {
      if (/^[\w-]{1,40}$/.test(permission) && (decision === 'allow' || decision === 'block')) entry[permission] = decision
    }
    if (Object.keys(entry).length > 0) out[origin] = entry
  }
  return out
}

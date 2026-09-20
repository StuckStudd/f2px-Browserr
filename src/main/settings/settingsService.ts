import fs, { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DEFAULT_SETTINGS, SEARCH_ENGINES } from '../../shared/settings'
import type { Settings } from '../../shared/types'
import { isWebUrl } from '../../shared/url'
import type { Database } from '../storage/database'
import { wipeFile } from '../storage/legacy'
import { Emitter } from '../utils/emitter'

type Validators = { [K in keyof Settings]: (value: unknown) => Settings[K] | undefined }

const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)
const oneOf =
  <T extends string>(...values: T[]) =>
  (v: unknown): T | undefined =>
    typeof v === 'string' && (values as string[]).includes(v) ? (v as T) : undefined
const str =
  (max: number) =>
  (v: unknown): string | undefined =>
    typeof v === 'string' ? v.slice(0, max) : undefined

/** scheme://host:port — the only shapes Chromium's proxy rules need. */
const PROXY_URL = /^(?:https?|socks4|socks5):\/\/(?:[a-z0-9.-]{1,253}|\[[0-9a-f:]{2,45}\]):\d{1,5}$/i

const VALIDATORS: Validators = {
  onboarded: bool,
  searchEngine: oneOf(...(Object.keys(SEARCH_ENGINES) as Settings['searchEngine'][])),
  startupBehavior: oneOf('home', 'restore'),
  homeUrl: (v) => (typeof v === 'string' && (v === '' || isWebUrl(v)) ? v : undefined),
  quickAccessEnabled: bool,
  showClock: bool,
  clock24h: bool,
  showGreeting: bool,
  userName: str(40),
  background: oneOf('default', 'custom'),
  backgroundImage: (v) =>
    v === null ? null : typeof v === 'string' && /^[\w.-]{1,120}$/.test(v) ? v : undefined,
  theme: oneOf('dark', 'light', 'system'),
  accent: oneOf('white', 'gray', 'custom'),
  accentCustom: (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined),
  animations: bool,
  compactMode: bool,
  showBookmarksBar: bool,
  chromeCompat: bool,
  trackerBlocking: oneOf('off', 'standard', 'strict'),
  adBlocking: bool,
  cosmeticFiltering: bool,
  fingerprintProtection: oneOf('off', 'standard', 'strict'),
  blockThirdPartyCookies: bool,
  stripCrossSiteReferrer: bool,
  webrtcPolicy: oneOf('public', 'proxy-only'),
  proxyMode: oneOf('system', 'direct', 'custom', 'tor'),
  proxyUrl: (v) => (typeof v === 'string' && (v === '' || PROXY_URL.test(v)) ? v : undefined),
  torProxyUrl: (v) => (typeof v === 'string' && (v === '' || PROXY_URL.test(v)) ? v : undefined),
  torPath: (v) => (typeof v === 'string' && v.length <= 400 && !/["\0\r\n]/.test(v) ? v : undefined),
  httpsOnly: bool,
  threatProtection: bool,
  protectionUpdates: bool,
  checkUpdates: bool,
  stripTrackingParams: bool,
  secureDns: oneOf('off', 'automatic', 'strict'),
  dnsProvider: oneOf('cloudflare', 'quad9', 'mullvad', 'custom'),
  dnsCustomUrl: (v) => (typeof v === 'string' && (v === '' || /^https:\/\/[^\s]{4,300}$/.test(v)) ? v : undefined),
  doNotTrack: bool,
  searchSuggestions: bool,
  spellcheck: bool,
  clearCookiesOnExit: bool,
  clearHistoryOnExit: bool,
  downloadMode: oneOf('default', 'ask', 'custom'),
  downloadPath: str(400),
  downloadNotifications: bool,
  startWithWindows: bool,
  minimizeToTray: bool,
  hardwareAcceleration: bool
}

function sanitize(input: unknown): Partial<Settings> {
  const out: Record<string, unknown> = {}
  if (typeof input !== 'object' || input === null) return out
  for (const key of Object.keys(VALIDATORS) as (keyof Settings)[]) {
    if (!(key in input)) continue
    const value = VALIDATORS[key]((input as Record<string, unknown>)[key])
    if (value !== undefined) out[key] = value
  }
  return out as Partial<Settings>
}

const KV_KEY = 'settings'

/**
 * Flags that must be known before Electron is ready (GPU acceleration can only be switched off early).
 * They are not sensitive, so they live in a tiny plaintext file next to the encrypted vault.
 */
export function readBootFlags(userData: string): { hardwareAcceleration: boolean } {
  try {
    const raw = JSON.parse(readFileSync(path.join(userData, 'boot.json'), 'utf8')) as { hardwareAcceleration?: unknown }
    if (typeof raw.hardwareAcceleration === 'boolean') return { hardwareAcceleration: raw.hardwareAcceleration }
  } catch {
    /* fall back to the pre-encryption settings file, if any */
  }
  try {
    const legacy = JSON.parse(readFileSync(path.join(userData, 'settings.json'), 'utf8')) as { hardwareAcceleration?: unknown }
    if (typeof legacy.hardwareAcceleration === 'boolean') return { hardwareAcceleration: legacy.hardwareAcceleration }
  } catch {
    /* no legacy file */
  }
  return { hardwareAcceleration: true }
}

/** Settings are stored inside the encrypted vault (they contain paths, your name and your home page). */
export class SettingsService {
  readonly onChange = new Emitter<{ settings: Settings; changed: (keyof Settings)[] }>()
  private current: Settings

  constructor(
    private readonly db: Database,
    private readonly userData: string
  ) {
    let stored: Partial<Settings> = sanitize(db.getKv<unknown>(KV_KEY))
    // Migrate the plaintext settings.json written by older versions, then destroy it.
    const legacyFile = path.join(userData, 'settings.json')
    if (fs.existsSync(legacyFile)) {
      try {
        stored = { ...sanitize(JSON.parse(readFileSync(legacyFile, 'utf8'))), ...stored }
      } catch {
        /* unreadable legacy file: ignore */
      }
      wipeFile(legacyFile)
    }
    this.current = { ...DEFAULT_SETTINGS, ...stored }
    this.db.setKv(KV_KEY, this.current)
    this.writeBoot()
  }

  private writeBoot(): void {
    try {
      writeFileSync(path.join(this.userData, 'boot.json'), JSON.stringify({ hardwareAcceleration: this.current.hardwareAcceleration }))
    } catch (error) {
      console.error('[settings] could not write boot flags', error)
    }
  }

  get(): Settings {
    return { ...this.current }
  }

  update(patch: unknown): Settings {
    const clean = sanitize(patch)
    const changed = (Object.keys(clean) as (keyof Settings)[]).filter((k) => this.current[k] !== clean[k])
    if (changed.length > 0) {
      this.current = { ...this.current, ...clean }
      this.db.setKv(KV_KEY, this.current)
      if (changed.includes('hardwareAcceleration')) this.writeBoot()
      this.onChange.emit({ settings: this.get(), changed })
    }
    return this.get()
  }

  /** Writes any pending changes to the encrypted vault (called when the app quits). */
  async flushNow(): Promise<void> {
    this.db.flush()
  }
}

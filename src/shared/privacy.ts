import type { PrivacyLevel, Settings } from './types'

/**
 * Privacy levels are named bundles of the fine-grained settings. Nothing is stored for the level itself:
 * it is derived from the settings (`detectPrivacyLevel`), so changing a single switch simply makes the level "custom".
 */
export type NamedPrivacyLevel = Exclude<PrivacyLevel, 'custom'>

type PresetKeys =
  | 'trackerBlocking'
  | 'adBlocking'
  | 'cosmeticFiltering'
  | 'fingerprintProtection'
  | 'blockThirdPartyCookies'
  | 'stripCrossSiteReferrer'
  | 'webrtcPolicy'
  | 'httpsOnly'
  | 'stripTrackingParams'
  | 'threatProtection'
  | 'doNotTrack'
  | 'searchSuggestions'
  | 'secureDns'

export const PRIVACY_PRESETS: Record<NamedPrivacyLevel, Pick<Settings, PresetKeys>> = {
  standard: {
    trackerBlocking: 'standard',
    adBlocking: true,
    cosmeticFiltering: true,
    fingerprintProtection: 'standard',
    blockThirdPartyCookies: false,
    stripCrossSiteReferrer: false,
    webrtcPolicy: 'public',
    httpsOnly: true,
    stripTrackingParams: true,
    threatProtection: true,
    doNotTrack: true,
    searchSuggestions: false,
    secureDns: 'automatic'
  },
  strict: {
    trackerBlocking: 'strict',
    adBlocking: true,
    cosmeticFiltering: true,
    fingerprintProtection: 'strict',
    blockThirdPartyCookies: true,
    stripCrossSiteReferrer: true,
    webrtcPolicy: 'proxy-only',
    httpsOnly: true,
    stripTrackingParams: true,
    threatProtection: true,
    doNotTrack: true,
    searchSuggestions: false,
    secureDns: 'automatic'
  },
  anonymous: {
    trackerBlocking: 'strict',
    adBlocking: true,
    cosmeticFiltering: true,
    fingerprintProtection: 'strict',
    blockThirdPartyCookies: true,
    stripCrossSiteReferrer: true,
    webrtcPolicy: 'proxy-only',
    httpsOnly: true,
    stripTrackingParams: true,
    threatProtection: true,
    doNotTrack: true,
    searchSuggestions: false,
    secureDns: 'strict'
  }
}

export const PRIVACY_LEVELS: readonly NamedPrivacyLevel[] = ['standard', 'strict', 'anonymous']

/** Which level do the current settings correspond to? Anything that does not match a bundle exactly is `custom`. */
export function detectPrivacyLevel(s: Settings): PrivacyLevel {
  for (const level of ['anonymous', 'strict', 'standard'] as const) {
    const preset = PRIVACY_PRESETS[level]
    const same = (Object.keys(preset) as (keyof typeof preset)[]).every((k) => s[k] === preset[k])
    if (!same) continue
    // Anonymous is defined by its route: without Tor the strict bundle is just "strict".
    if (level === 'anonymous') return s.proxyMode === 'tor' ? 'anonymous' : 'strict'
    if (level === 'strict' && s.proxyMode === 'tor') continue
    return level
  }
  return 'custom'
}

/**
 * The settings patch that switches to `level`. Moving away from Tor also restores the system proxy,
 * so a level never leaves the browser routed through a Tor client the user no longer wants.
 */
export function privacyLevelPatch(current: Settings, level: NamedPrivacyLevel): Partial<Settings> {
  const patch: Partial<Settings> = { ...PRIVACY_PRESETS[level] }
  if (level === 'anonymous') {
    patch.proxyMode = 'tor'
    patch.clearCookiesOnExit = true
    patch.clearHistoryOnExit = true
  } else if (current.proxyMode === 'tor') {
    patch.proxyMode = 'system'
  }
  return patch
}

import type { FingerprintLevel, PageReport, Settings, TrackerBlocking, WebRtcPolicy } from '../../shared/types'

/** Which kind of browsing context a session serves. Tor windows get the strictest policy whatever the settings say. */
export type SessionKind = 'normal' | 'private' | 'tor'

/** The privacy behaviour actually applied to one session (settings, tightened for Tor windows). */
export interface Policy {
  trackers: TrackerBlocking
  ads: boolean
  cosmetic: boolean
  fingerprint: FingerprintLevel
  blockThirdPartyCookies: boolean
  stripReferrer: boolean
  webrtc: WebRtcPolicy
  /** DNT / Global Privacy Control headers. Tor windows omit them: every extra header bit makes the browser more unusual. */
  sendDnt: boolean
  /** Per-site exceptions are honoured (never in Tor windows). */
  allowExceptions: boolean
}

export function policyFor(s: Settings, kind: SessionKind): Policy {
  if (kind === 'tor') {
    return {
      trackers: 'strict',
      ads: true,
      cosmetic: true,
      fingerprint: 'strict',
      blockThirdPartyCookies: true,
      stripReferrer: true,
      webrtc: 'proxy-only',
      sendDnt: false,
      allowExceptions: false
    }
  }
  // "Block trackers: Off" is the master switch — nothing is blocked then, filter lists included.
  const protecting = s.trackerBlocking !== 'off'
  return {
    trackers: s.trackerBlocking,
    ads: protecting && s.adBlocking,
    cosmetic: protecting && s.cosmeticFiltering,
    fingerprint: s.fingerprintProtection,
    blockThirdPartyCookies: s.blockThirdPartyCookies,
    stripReferrer: s.stripCrossSiteReferrer,
    webrtc: s.webrtcPolicy,
    sendDnt: s.doNotTrack,
    allowExceptions: true
  }
}

export const EMPTY_REPORT: PageReport = Object.freeze({
  trackers: 0,
  ads: 0,
  cookies: 0,
  referrers: 0,
  fingerprint: 0,
  pings: 0,
  threats: 0,
  upgrades: 0
})

export function newReport(): PageReport {
  return { ...EMPTY_REPORT }
}

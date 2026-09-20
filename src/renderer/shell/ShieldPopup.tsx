import { useEffect, useState } from 'react'
import type { PageReport, SiteInfo } from '@shared/types'
import { Button, Toggle } from '@renderer/components/Controls'
import { Icon } from '@renderer/components/Icon'
import { call, fire, subscribe } from '@renderer/lib/api'

const STATS: { key: keyof PageReport; label: string }[] = [
  { key: 'ads', label: 'Ads blocked' },
  { key: 'trackers', label: 'Trackers blocked' },
  { key: 'fingerprint', label: 'Fingerprinting neutralised' },
  { key: 'cookies', label: 'Third-party cookies stopped' },
  { key: 'referrers', label: 'Referrers removed' },
  { key: 'pings', label: 'Beacons blocked' },
  { key: 'upgrades', label: 'Upgraded to HTTPS' }
]

const PERMISSION_LABEL: Record<string, string> = { media: 'Camera & microphone', notifications: 'Notifications' }

/** What the shield does on the current site, with the few switches that make sense per site. */
export function ShieldPopup({ blockThirdPartyCookies, onClose }: { blockThirdPartyCookies: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<SiteInfo | null | undefined>(undefined)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    let alive = true
    const load = (): void => void call('site.info').then((v) => alive && setInfo(v), () => alive && setInfo(null))
    load()
    // counters keep moving while the page loads
    const timer = window.setInterval(load, 1500)
    const off = subscribe('shell:state', load)
    return () => {
      alive = false
      window.clearInterval(timer)
      off()
    }
  }, [])

  const apply = (job: Promise<SiteInfo | null>): void => void job.then(setInfo, () => undefined)

  if (info === undefined) return <section className="popup popup--shield" data-popup aria-label="Shield" />

  if (info === null) {
    return (
      <section className="popup popup--shield" data-popup aria-label="Shield">
        <header className="popup__head">
          <span className="label">Shield</span>
        </header>
        <div className="popup__empty">
          <Icon name="shield" size={18} />
          <span className="label">Nothing to protect on this page</span>
        </div>
        <footer className="popup__foot">
          <Button
            variant="ghost"
            icon="external"
            onClick={() => {
              fire('ui.openPage', 'privacy')
              onClose()
            }}
          >
            Privacy center
          </Button>
        </footer>
      </section>
    )
  }

  const total = Object.values(info.report).reduce((a, b) => a + b, 0)

  return (
    <section className="popup popup--shield" data-popup aria-label="Shield">
      <header className="popup__head">
        <span className="label">Shield · {info.site}</span>
        <span className={`shield__badge mono ${info.shieldsUp ? 'is-up' : 'is-down'}`}>{info.shieldsUp ? 'UP' : 'DOWN'}</span>
      </header>

      <div className="popup__body">
        {info.locked ? (
          <p className="shield__note">Tor window: the strictest protection is always on and cannot be switched off for a site.</p>
        ) : (
          <div className="shield__row">
            <div>
              <div className="shield__label">Shields for this site</div>
              <div className="shield__hint">Ad &amp; tracker blocking, fingerprint protection, cookie and referrer rules.</div>
            </div>
            <Toggle label="Shields for this site" checked={info.shieldsUp} onChange={(on) => apply(call('site.setShields', on))} />
          </div>
        )}

        {info.shieldsUp && (
          <div className="shield__stats" aria-label="What was protected on this page">
            {STATS.map((s) => (
              <div key={s.key} className={`shield__stat ${info.report[s.key] > 0 ? 'has-value' : ''}`}>
                <span>{s.label}</span>
                <span className="mono">{info.report[s.key]}</span>
              </div>
            ))}
            {total === 0 && <div className="shield__quiet">Nothing needed blocking on this page yet.</div>}
          </div>
        )}

        {!info.locked && blockThirdPartyCookies && info.shieldsUp && (
          <div className="shield__row">
            <div>
              <div className="shield__label">Allow third-party cookies here</div>
              <div className="shield__hint">Only if a login or embedded content on this site does not work.</div>
            </div>
            <Toggle label="Allow third-party cookies on this site" checked={info.allowThirdPartyCookies} onChange={(allow) => apply(call('site.setCookies', allow))} />
          </div>
        )}

        {info.permissions.length > 0 && (
          <div className="shield__perms">
            <div className="label">Permissions for this site</div>
            {info.permissions.map((p) => (
              <div key={p.permission} className="shield__perm">
                <span>
                  {PERMISSION_LABEL[p.permission] ?? p.permission}: <span className="mono">{p.decision === 'allow' ? 'ALLOWED' : 'BLOCKED'}</span>
                </span>
                <Button variant="ghost" onClick={() => apply(call('site.setPermission', p.origin, p.permission, null))}>
                  Reset
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="popup__foot">
        <Button
          variant="ghost"
          icon="external"
          onClick={() => {
            fire('ui.openPage', 'privacy')
            onClose()
          }}
        >
          Privacy center
        </Button>
        {confirmClear ? (
          <Button
            variant="danger"
            icon="trash"
            onClick={() => {
              setConfirmClear(false)
              void call('site.clearData').then(onClose, () => undefined)
            }}
          >
            Sign out & clear
          </Button>
        ) : (
          <Button variant="ghost" icon="trash" onClick={() => setConfirmClear(true)}>
            Clear site data
          </Button>
        )}
      </footer>
    </section>
  )
}

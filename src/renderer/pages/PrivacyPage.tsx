import { useCallback, useEffect, useState } from 'react'
import { detectPrivacyLevel, PRIVACY_LEVELS, type NamedPrivacyLevel } from '@shared/privacy'
import type { FilterListStatus, FireOptions, NetStatus, PageReport, PrivacyStats, SitePermission, Settings } from '@shared/types'
import { Button, Checkbox, Segmented, Toggle } from '@renderer/components/Controls'
import { Dialog } from '@renderer/components/Dialog'
import { Icon } from '@renderer/components/Icon'
import { Row, Section, cleanError } from '@renderer/components/SettingsParts'
import { useToast } from '@renderer/components/Toast'
import { call, subscribe } from '@renderer/lib/api'
import { PageFrame } from './PageFrame'

interface Props {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

const LEVEL_COPY: Record<NamedPrivacyLevel, { title: string; tag: string; points: string[] }> = {
  standard: {
    title: 'Standard',
    tag: 'Everyday browsing',
    points: [
      'Ads and trackers blocked (EasyList, EasyPrivacy, uBlock, RU AdList)',
      'Canvas, audio and WebGL fingerprints made useless across sites',
      'HTTPS-only, encrypted DNS, tracking parameters removed',
      'Almost never breaks a site'
    ]
  },
  strict: {
    title: 'Strict',
    tag: 'Serious privacy',
    points: [
      'Everything in Standard, and third-party cookies blocked',
      'Cross-site Referer removed, no direct WebRTC connections',
      'Hardware, screen, time zone and language look the same for every F2PX user',
      'A few sites need a per-site exception (the shield button)'
    ]
  },
  anonymous: {
    title: 'Anonymous',
    tag: 'Hide your IP address too',
    points: [
      'Everything in Strict',
      'All traffic goes through the Tor network — sites see a Tor exit, not you',
      'DNS is resolved inside Tor; if Tor is not running nothing is sent at all',
      'Cookies and history are erased when you quit. Slower than normal browsing'
    ]
  }
}

const COUNTERS: { key: keyof PageReport; label: string }[] = [
  { key: 'ads', label: 'Ads blocked' },
  { key: 'trackers', label: 'Trackers blocked' },
  { key: 'fingerprint', label: 'Fingerprinting attempts neutralised' },
  { key: 'cookies', label: 'Third-party cookies stopped' },
  { key: 'referrers', label: 'Referrers removed' },
  { key: 'pings', label: 'Beacons blocked' },
  { key: 'threats', label: 'Dangerous sites / resources blocked' },
  { key: 'upgrades', label: 'Pages upgraded to HTTPS' }
]

const PERMISSION_LABEL: Record<string, string> = { media: 'Camera & microphone', notifications: 'Notifications' }

function LevelCards({ settings, net, toast }: { settings: Settings; net: NetStatus | null; toast: (m: string, kind?: 'error') => void }) {
  const current = detectPrivacyLevel(settings)
  const [pendingAnonymous, setPendingAnonymous] = useState(false)

  const apply = (level: NamedPrivacyLevel): void => {
    call('privacy.applyLevel', level).then(
      () => toast(`${LEVEL_COPY[level].title} level is on`),
      (e: Error) => toast(cleanError(e), 'error')
    )
  }

  return (
    <>
      <div className="levels" role="radiogroup" aria-label="Privacy level">
        {PRIVACY_LEVELS.map((level) => {
          const copy = LEVEL_COPY[level]
          const active = current === level
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={active}
              className={`level ${active ? 'is-active' : ''}`}
              onClick={() => (level === 'anonymous' ? setPendingAnonymous(true) : apply(level))}
            >
              <span className="level__head">
                <span className="level__title">{copy.title}</span>
                {active && <Icon name="check" size={13} strokeWidth={2.2} />}
              </span>
              <span className="level__tag label">{copy.tag}</span>
              <ul>
                {copy.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </button>
          )
        })}
      </div>
      {current === 'custom' && (
        <p className="levels__custom mono">CUSTOM — some switches differ from all three levels. Pick a level to reset them.</p>
      )}
      {pendingAnonymous && (
        <Dialog
          title="Anonymous level"
          submitLabel="Turn on"
          onClose={() => setPendingAnonymous(false)}
          onSubmit={() => {
            setPendingAnonymous(false)
            apply('anonymous')
          }}
        >
          <p className="dialog__text">
            Everything you open will go through the Tor network. It hides your IP address from websites and your network provider, and it is much
            slower than normal browsing.
          </p>
          <p className="dialog__text">
            {net?.tor.reachable
              ? `A Tor client was found (${net.tor.proxy}). You are ready.`
              : 'F2PX does not include Tor and did not find one running. Start Tor Browser, or choose tor.exe below in “Connection” — until then no page will load (nothing is ever sent directly).'}
          </p>
        </Dialog>
      )}
    </>
  )
}

function Counters({ stats, onReset }: { stats: PrivacyStats | null; onReset: () => void }) {
  return (
    <div className="pcounters">
      <div className="pcounters__head">
        <span />
        <span className="label">This session</span>
        <span className="label">All time</span>
      </div>
      {COUNTERS.map((c) => (
        <div key={c.key} className="pcounters__row">
          <span>{c.label}</span>
          <span className="mono">{(stats?.session[c.key] ?? 0).toLocaleString('en-US')}</span>
          <span className="mono pcounters__total">{(stats?.total[c.key] ?? 0).toLocaleString('en-US')}</span>
        </div>
      ))}
      <div className="pcounters__foot">
        <Button variant="ghost" icon="trash" onClick={onReset}>
          Reset counters
        </Button>
      </div>
    </div>
  )
}

function ConnectionSection({ settings, update, net, refresh, toast }: Props & { net: NetStatus | null; refresh: () => void; toast: (m: string, kind?: 'error') => void }) {
  const [proxy, setProxy] = useState(settings.proxyUrl)
  const [tor, setTor] = useState(settings.torProxyUrl)
  const proxyValid = proxy === '' || /^(?:https?|socks4|socks5):\/\/[^\s/:]+:\d{1,5}$/i.test(proxy)
  const torValid = tor === '' || /^socks5:\/\/[^\s/:]+:\d{1,5}$/i.test(tor)

  const status = net?.tor
  return (
    <>
      <Row label="How F2PX connects" hint="Tor sends everything through the Tor network and never falls back to a direct connection if it is unavailable.">
        <Segmented
          label="Connection"
          value={settings.proxyMode}
          onChange={(proxyMode) => update({ proxyMode })}
          options={[
            { value: 'system', label: 'System' },
            { value: 'direct', label: 'Direct' },
            { value: 'custom', label: 'Proxy' },
            { value: 'tor', label: 'Tor' }
          ]}
        />
      </Row>
      {settings.proxyMode === 'custom' && (
        <Row label="Proxy address" hint="http://host:port or socks5://host:port. Without a valid address nothing is sent." stack>
          <input
            className="input srow__url"
            value={proxy}
            placeholder="socks5://127.0.0.1:1080"
            spellCheck={false}
            aria-invalid={!proxyValid}
            onChange={(e) => setProxy(e.target.value.trim())}
            onBlur={() => proxyValid && update({ proxyUrl: proxy })}
            onKeyDown={(e) => e.key === 'Enter' && proxyValid && update({ proxyUrl: proxy })}
          />
        </Row>
      )}

      <Row
        label="Tor client"
        hint={
          status?.reachable
            ? `Running at ${status.proxy}${status.managed && status.running ? ' (started by F2PX)' : ''}.`
            : status?.error
              ? status.error
              : 'Not found. Start Tor Browser, or choose tor.exe from the Tor Expert Bundle and F2PX will run it for you.'
        }
        stack
      >
        <div className="srow__stack">
          <div className="srow__inline">
            <span className={`chip ${status?.reachable ? 'chip--completed' : 'chip--failed'}`}>{status?.reachable ? 'AVAILABLE' : 'NOT FOUND'}</span>
            <Button icon="reload" onClick={refresh}>
              Check again
            </Button>
            <Button icon="onion" onClick={() => call('ui.newTorWindow').catch(() => undefined)} disabled={!status?.reachable}>
              New Tor window
            </Button>
          </div>
          <div className="srow__inline">
            <span className="pathbox mono" title={settings.torPath}>
              {settings.torPath || 'tor.exe — not set'}
            </span>
            <Button
              icon="folder"
              onClick={() => call('settings.pickTorPath').then(refresh, (e: Error) => toast(cleanError(e), 'error'))}
            >
              Choose
            </Button>
            {settings.torPath && (
              <Button variant="ghost" onClick={() => update({ torPath: '' })}>
                Forget
              </Button>
            )}
          </div>
          <input
            className="input srow__url"
            value={tor}
            placeholder="Tor address (optional), e.g. socks5://127.0.0.1:9150"
            spellCheck={false}
            aria-invalid={!torValid}
            onChange={(e) => setTor(e.target.value.trim())}
            onBlur={() => torValid && update({ torProxyUrl: tor })}
            onKeyDown={(e) => e.key === 'Enter' && torValid && update({ torProxyUrl: tor })}
          />
        </div>
      </Row>
      <p className="ssec__note">
        A Tor window (Ctrl+Shift+Alt+N) always goes through Tor, whatever is chosen above, and always uses the strictest shield. F2PX is not Tor Browser:
        the fingerprint of the browser itself is not identical to Tor Browser users&apos;, so a determined adversary can still tell the two apart. For the
        strongest anonymity use Tor Browser itself.
      </p>
    </>
  )
}

function FilterListsSection({ settings, update, toast }: Props & { toast: (m: string, kind?: 'error') => void }) {
  const [status, setStatus] = useState<FilterListStatus | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const load = (): void => void call('filters.status').then(setStatus, () => undefined)
    load()
    const timer = window.setInterval(load, 2500)
    return () => window.clearInterval(timer)
  }, [])
  const refresh = (): void => {
    setBusy(true)
    call('filters.update')
      .then(
        (s) => {
          setStatus(s)
          toast(`Filter lists updated: ${s.networkRules.toLocaleString('en-US')} rules`)
        },
        (e: Error) => toast(cleanError(e), 'error')
      )
      .finally(() => setBusy(false))
  }
  return (
    <>
      <Row label="Tracking protection" hint="The master switch for ad and tracker blocking. Strict also blocks social widgets and fingerprinting scripts and may break some embeds.">
        <Segmented
          label="Tracking protection"
          value={settings.trackerBlocking}
          onChange={(trackerBlocking) => update({ trackerBlocking })}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'standard', label: 'Standard' },
            { value: 'strict', label: 'Strict' }
          ]}
        />
      </Row>
      <Row label="Use filter lists" hint="EasyList, EasyPrivacy, uBlock Origin filters and RU AdList — about 175,000 rules that work offline. Without them only the small built-in host list is used.">
        <Toggle label="Use filter lists" checked={settings.adBlocking} onChange={(adBlocking) => update({ adBlocking })} />
      </Row>
      <Row label="Hide ad placeholders" hint="Removes the empty frames and banners left behind (element hiding).">
        <Toggle label="Hide ad placeholders" checked={settings.cosmeticFiltering} onChange={(cosmeticFiltering) => update({ cosmeticFiltering })} />
      </Row>
      <Row label="Filter lists" hint="Refreshing contacts easylist.to, GitHub and adblockplus.org — only when you press the button or enable daily updates.">
        <div className="srow__inline">
          <span className="mono srow__meta">
            {status
              ? `${status.networkRules.toLocaleString('en-US')} RULES · ${status.cosmeticRules.toLocaleString('en-US')} HIDING · ${status.source === 'updated' ? 'UPDATED' : 'BUNDLED'} ${status.updatedAt?.slice(0, 10) ?? ''}${status.ready ? '' : ' · LOADING…'}`
              : '…'}
          </span>
          <Button icon="reload" onClick={refresh} disabled={busy}>
            {busy ? 'Updating…' : 'Update now'}
          </Button>
        </div>
      </Row>
      <Row label="Update lists every day" hint="Also refreshes the malware and phishing list. Off by default because it contacts those servers.">
        <Toggle label="Update lists every day" checked={settings.protectionUpdates} onChange={(protectionUpdates) => update({ protectionUpdates })} />
      </Row>
    </>
  )
}

function SiteRulesSection({ toast }: { toast: (m: string, kind?: 'error') => void }) {
  const [rules, setRules] = useState<{ site: string; shieldsOff: boolean; cookies: boolean }[]>([])
  const [permissions, setPermissions] = useState<SitePermission[]>([])
  const load = useCallback((): void => {
    void call('siteRules.list').then(setRules, () => undefined)
    void call('permissions.list').then(setPermissions, () => undefined)
  }, [])
  useEffect(load, [load])

  return (
    <>
      <Row label="Site exceptions" hint="Sites where you turned the shield off or allowed third-party cookies (use the shield button in the address bar).">
        <div className="srow__stack">
          {rules.length === 0 ? (
            <span className="mono srow__meta">NONE</span>
          ) : (
            rules.map((r) => (
              <div key={r.site} className="pchip">
                <span className="mono">{r.site}</span>
                <span className="label">{[r.shieldsOff ? 'shield off' : '', r.cookies ? 'cookies allowed' : ''].filter(Boolean).join(' · ')}</span>
              </div>
            ))
          )}
          {rules.length > 0 && (
            <Button
              variant="ghost"
              icon="trash"
              onClick={() => call('siteRules.reset').then(() => { toast('Site exceptions removed'); load() }, (e: Error) => toast(cleanError(e), 'error'))}
            >
              Remove all exceptions
            </Button>
          )}
        </div>
      </Row>
      <Row label="Remembered permissions" hint="Camera, microphone and notification answers you chose to remember. Geolocation, USB, serial, Bluetooth and similar are never offered to sites.">
        <div className="srow__stack">
          {permissions.length === 0 ? (
            <span className="mono srow__meta">NONE</span>
          ) : (
            permissions.map((p) => (
              <div key={`${p.origin}|${p.permission}`} className="pchip">
                <span className="mono">{p.origin.replace(/^https?:\/\//, '')}</span>
                <span className="label">
                  {PERMISSION_LABEL[p.permission] ?? p.permission}: {p.decision === 'allow' ? 'allowed' : 'blocked'}
                </span>
                <Button variant="ghost" onClick={() => call('permissions.reset', p.origin, p.permission).then(load, () => undefined)}>
                  Reset
                </Button>
              </div>
            ))
          )}
        </div>
      </Row>
    </>
  )
}

function FireCard({ toast }: { toast: (m: string, kind?: 'error') => void }) {
  const [options, setOptions] = useState<FireOptions>({ tabs: true, history: true, downloads: true, cookies: true, cache: true, permissions: true })
  const [confirm, setConfirm] = useState(false)
  const any = Object.values(options).some(Boolean)
  const labels: [keyof FireOptions, string][] = [
    ['tabs', 'Close all tabs and windows'],
    ['history', 'Browsing history and saved session'],
    ['cookies', 'Cookies & site data (all window types)'],
    ['cache', 'Cached files'],
    ['downloads', 'Download list'],
    ['permissions', 'Remembered permissions']
  ]
  return (
    <div className="clearcard">
      <div className="clearcard__grid">
        {labels.map(([key, label]) => (
          <Checkbox key={key} checked={options[key]} onChange={(value) => setOptions({ ...options, [key]: value })}>
            {label}
          </Checkbox>
        ))}
      </div>
      <Button variant="danger" icon="flame" disabled={!any} onClick={() => setConfirm(true)}>
        Fire
      </Button>
      {confirm && (
        <Dialog
          title="Fire"
          danger
          submitLabel="Clear and restart"
          onClose={() => setConfirm(false)}
          onSubmit={() => {
            setConfirm(false)
            call('privacy.fire', options).then(() => toast('Cleared'), (e: Error) => toast(cleanError(e), 'error'))
          }}
        >
          <p className="dialog__text">
            {options.tabs ? 'All windows close and you start with one empty window. ' : ''}
            {options.cookies ? 'You will be signed out of every site. Sites also get a new fingerprint identity. ' : ''}
            This cannot be undone. Downloaded files stay on disk.
          </p>
        </Dialog>
      )}
    </div>
  )
}

export function PrivacyPage({ settings, update }: Props) {
  const { toast, node } = useToast()
  const [stats, setStats] = useState<PrivacyStats | null>(null)
  const [net, setNet] = useState<NetStatus | null>(null)

  const loadStats = useCallback((): void => void call('privacy.stats').then(setStats, () => undefined), [])
  const loadNet = useCallback((): void => void call('net.status').then(setNet, () => undefined), [])
  const refreshNet = useCallback((): void => void call('net.refresh').then(setNet, () => undefined), [])

  useEffect(() => {
    loadStats()
    loadNet()
    const timer = window.setInterval(loadStats, 3000)
    const off = subscribe('net:changed', loadNet)
    return () => {
      window.clearInterval(timer)
      off()
    }
  }, [loadStats, loadNet])
  useEffect(loadNet, [settings.proxyMode, settings.proxyUrl, settings.torProxyUrl, settings.torPath, loadNet])

  const routeLabel =
    net === null
      ? '…'
      : net.route === 'tor'
        ? net.tor.reachable
          ? 'THROUGH TOR'
          : 'TOR REQUIRED · NOT FOUND · NOTHING IS SENT'
        : net.route === 'custom'
          ? `THROUGH PROXY ${net.proxy}`
          : net.route === 'direct'
            ? 'DIRECT (NO PROXY)'
            : 'SYSTEM SETTINGS'

  return (
    <PageFrame code="Privacy" title="Privacy center">
      <div className="settings settings--single">
        <div className="settings__body">
          <Section id="level" title="Privacy level">
            <LevelCards settings={settings} net={net} toast={toast} />
          </Section>

          <Section id="now" title="What is protected">
            <div className="pshield">
              <div className="pshield__row">
                <span className="label">Connection</span>
                <span className={`pshield__state mono ${net?.route === 'tor' && !net.tor.reachable ? 'is-bad' : ''}`}>{routeLabel}</span>
              </div>
              <div className="pshield__count">
                <span className="pshield__num mono">{((stats?.session.ads ?? 0) + (stats?.session.trackers ?? 0)).toLocaleString('en-US')}</span>
                <span className="label">ads &amp; trackers blocked this session</span>
              </div>
            </div>
            <Counters stats={stats} onReset={() => call('privacy.resetStats').then(loadStats, () => undefined)} />
          </Section>

          <Section id="connection" title="Connection">
            <ConnectionSection settings={settings} update={update} net={net} refresh={refreshNet} toast={toast} />
          </Section>

          <Section id="lists" title="Ads & trackers">
            <FilterListsSection settings={settings} update={update} toast={toast} />
          </Section>

          <Section id="fingerprint" title="Fingerprinting & cookies">
            <Row label="Fingerprint protection" hint="Canvas, audio and WebGL readings differ per site and per session, so trackers cannot recognise you across sites. Strict also reports the same hardware, screen, time zone (UTC) and language (en-US) as every other F2PX user; a few sites that check them may need an exception.">
              <Segmented
                label="Fingerprint protection"
                value={settings.fingerprintProtection}
                onChange={(fingerprintProtection) => update({ fingerprintProtection })}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'standard', label: 'Standard' },
                  { value: 'strict', label: 'Strict' }
                ]}
              />
            </Row>
            <Row label="Block third-party cookies" hint="Cookies that an embedded site would set or read while you are on another site. Login buttons or payment frames from another domain may need the shield button's cookie exception.">
              <Toggle label="Block third-party cookies" checked={settings.blockThirdPartyCookies} onChange={(blockThirdPartyCookies) => update({ blockThirdPartyCookies })} />
            </Row>
            <Row label="Remove cross-site Referer" hint="Sites you click through to no longer learn which page you came from.">
              <Toggle label="Remove cross-site referrer" checked={settings.stripCrossSiteReferrer} onChange={(stripCrossSiteReferrer) => update({ stripCrossSiteReferrer })} />
            </Row>
            <Row label="WebRTC" hint="Voice/video calls in the browser can reveal your addresses. Strict blocks direct connections; calls then need a relay and may fail on some sites.">
              <Segmented
                label="WebRTC"
                value={settings.webrtcPolicy}
                onChange={(webrtcPolicy) => update({ webrtcPolicy })}
                options={[
                  { value: 'public', label: 'Public address only' },
                  { value: 'proxy-only', label: 'No direct connections' }
                ]}
              />
            </Row>
          </Section>

          <Section id="sites" title="Sites">
            <SiteRulesSection toast={toast} />
          </Section>

          <Section id="fire" title="Fire">
            <Row label="Erase and start over" hint="Also available anywhere with Ctrl+Shift+Del." stack>
              <FireCard toast={toast} />
            </Row>
          </Section>

          <Section id="limits" title="Good to know">
            <div className="about">
              <p className="about__text">
                Your IP address is visible to every site you visit unless you use Tor (or a VPN / proxy you trust). The shield makes you much harder to
                follow around the web, but no browser can make you look identical to everyone: fonts, exact display size and GPU behaviour leak a
                little. Logging in to an account identifies you to that site regardless of any protection. F2PX sends nothing to any server of its
                own.
              </p>
            </div>
          </Section>
        </div>
      </div>
      {node}
    </PageFrame>
  )
}

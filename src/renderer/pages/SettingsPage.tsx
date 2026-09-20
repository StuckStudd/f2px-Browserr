import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DNS_PROVIDERS, SEARCH_ENGINE_LIST } from '@shared/settings'
import { SHORTCUTS } from '@shared/shortcuts'
import type { ClearDataOptions, PrivacyStats, SecurityStatus, Settings, ThreatListStatus, UpdateStatus } from '@shared/types'
import { isWebUrl } from '@shared/url'
import { Button, Checkbox, Segmented, Select, Toggle } from '@renderer/components/Controls'
import { Dialog, Field } from '@renderer/components/Dialog'
import { Icon, type IconName } from '@renderer/components/Icon'
import { useToast } from '@renderer/components/Toast'
import { call, fire } from '@renderer/lib/api'
import { PageFrame } from './PageFrame'

interface Props {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

const SECTIONS: { id: string; label: string; icon: IconName }[] = [
  { id: 'general', label: 'General', icon: 'sliders' },
  { id: 'start', label: 'Start page', icon: 'home' },
  { id: 'appearance', label: 'Appearance', icon: 'monitor' },
  { id: 'privacy', label: 'Privacy', icon: 'shield' },
  { id: 'security', label: 'Security', icon: 'lock' },
  { id: 'downloads', label: 'Downloads', icon: 'download' },
  { id: 'system', label: 'System', icon: 'settings' },
  { id: 'shortcuts', label: 'Shortcuts', icon: 'keyboard' },
  { id: 'about', label: 'About', icon: 'info' }
]

function Row({ label, hint, children, stack }: { label: string; hint?: string; children: ReactNode; stack?: boolean }) {
  return (
    <div className={`srow ${stack ? 'srow--stack' : ''}`}>
      <div className="srow__text">
        <div className="srow__label">{label}</div>
        {hint && <div className="srow__hint">{hint}</div>}
      </div>
      <div className="srow__control">{children}</div>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="ssec" id={`sec-${id}`} data-section={id}>
      <h2 className="ssec__title">
        <span className="label">{title}</span>
        <span className="ssec__line" />
      </h2>
      {children}
    </section>
  )
}

const cleanError = (e: Error): string => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

// ── controls reused in several sections ─────────────────────────────────
function SearchEngineRow({ settings, update }: Props) {
  return (
    <Row label="Search engine" hint="Used by the address bar and the start page.">
      <Select
        label="Search engine"
        value={settings.searchEngine}
        onChange={(searchEngine) => update({ searchEngine })}
        options={SEARCH_ENGINE_LIST.map((e) => ({ value: e.id, label: e.name }))}
      />
    </Row>
  )
}

function AccentRow({ settings, update }: Props) {
  return (
    <Row label="Accent" hint="One highlight colour; the interface stays monochrome.">
      <div className="srow__inline">
        <Segmented
          label="Accent"
          value={settings.accent}
          onChange={(accent) => update({ accent })}
          options={[
            { value: 'white', label: 'White' },
            { value: 'gray', label: 'Gray' },
            { value: 'custom', label: 'Custom' }
          ]}
        />
        {settings.accent === 'custom' && (
          <label className="colorpick" title="Pick accent colour">
            <input type="color" value={settings.accentCustom} onChange={(e) => update({ accent: 'custom', accentCustom: e.target.value })} />
            <span className="mono">{settings.accentCustom.toUpperCase()}</span>
          </label>
        )}
      </div>
    </Row>
  )
}

function BackgroundRow({ settings, update, onError }: Props & { onError: (m: string) => void }) {
  const pick = (): void => {
    call('settings.pickBackground').then(
      () => undefined,
      (e: Error) => onError(cleanError(e))
    )
  }
  return (
    <Row label="Background" hint="Default is the F2PX grid. A custom image is dimmed to keep the page readable.">
      <div className="srow__inline">
        <Segmented
          label="Background"
          value={settings.background}
          onChange={(value) => {
            if (value === 'default') fire('settings.clearBackground')
            else if (settings.backgroundImage) update({ background: 'custom' })
            else pick()
          }}
          options={[
            { value: 'default', label: 'Default' },
            { value: 'custom', label: 'Custom' }
          ]}
        />
        <Button icon="image" onClick={pick}>
          {settings.backgroundImage ? 'Change image' : 'Choose image'}
        </Button>
      </div>
    </Row>
  )
}

function HomeUrlControl({ settings, update }: Props) {
  const [custom, setCustom] = useState(settings.homeUrl !== '')
  const [value, setValue] = useState(settings.homeUrl)
  const valid = value === '' || isWebUrl(value)
  return (
    <div className="srow__stack">
      <Segmented
        label="Home page"
        value={custom ? 'custom' : 'start'}
        onChange={(v) => {
          setCustom(v === 'custom')
          if (v === 'start') {
            setValue('')
            update({ homeUrl: '' })
          }
        }}
        options={[
          { value: 'start', label: 'F2PX start page' },
          { value: 'custom', label: 'Custom URL' }
        ]}
      />
      {custom && (
        <input
          className="input srow__url"
          value={value}
          placeholder="https://example.com"
          spellCheck={false}
          aria-invalid={!valid}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => isWebUrl(value) && update({ homeUrl: value })}
          onKeyDown={(e) => e.key === 'Enter' && isWebUrl(value) && update({ homeUrl: value })}
        />
      )}
    </div>
  )
}


function PasswordDialog({ mode, onClose, onDone, onError }: { mode: 'set' | 'change' | 'remove'; onClose: () => void; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const needsCurrent = mode !== 'set'
  const needsNext = mode !== 'remove'
  const problem = needsNext && (next.length < 8 ? 'Use at least 8 characters.' : next !== confirm ? 'The passwords do not match.' : '')
  const title = mode === 'set' ? 'Set a password' : mode === 'change' ? 'Change password' : 'Remove password'

  const submit = (): void => {
    setBusy(true)
    call('security.setPassword', current, mode === 'remove' ? null : next).then(
      () => {
        onDone(mode === 'remove' ? 'Password removed' : 'Password saved')
        onClose()
      },
      (e: Error) => {
        onError(cleanError(e))
        setBusy(false)
      }
    )
  }

  return (
    <Dialog title={title} onClose={onClose} onSubmit={submit} submitLabel={mode === 'remove' ? 'Remove' : 'Save'} submitDisabled={busy || (needsNext && !!problem) || (needsCurrent && !current)} danger={mode === 'remove'}>
      {needsCurrent && (
        <Field label="Current password">
          <input className="input" type="password" value={current} autoFocus autoComplete="current-password" onChange={(e) => setCurrent(e.target.value)} />
        </Field>
      )}
      {needsNext && (
        <>
          <Field label="New password" hint={next && problem ? problem : undefined}>
            <input className="input" type="password" value={next} autoFocus={!needsCurrent} autoComplete="new-password" onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Repeat new password">
            <input className="input" type="password" value={confirm} autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <p className="dialog__text">Your data is encrypted with this password. If you forget it, it cannot be recovered.</p>
        </>
      )}
      {mode === 'remove' && <p className="dialog__text">F2PX will no longer ask for a password. Your data stays encrypted with a key tied to your Windows account.</p>}
    </Dialog>
  )
}

function SecurityCard({ onDone, onError }: { onDone: (m: string) => void; onError: (m: string) => void }) {
  const [status, setStatus] = useState<SecurityStatus | null>(null)
  const [dialog, setDialog] = useState<'set' | 'change' | 'remove' | null>(null)

  const load = (): void => void call('security.status').then(setStatus, () => undefined)
  useEffect(load, [])

  const label =
    status === null
      ? '…'
      : status.mode === 'password'
        ? 'ENCRYPTED · AES-256 · PASSWORD'
        : status.mode === 'dpapi'
          ? 'ENCRYPTED · AES-256 · WINDOWS ACCOUNT KEY'
          : 'NOT ENCRYPTED · NO OS KEY STORE AVAILABLE'

  return (
    <div className="pshield">
      <div className="pshield__row">
        <span className="label">Local data</span>
        <span className={`pshield__state mono ${status && !status.encrypted ? 'is-bad' : ''}`}>{label}</span>
      </div>
      <p className="pshield__note">
        History, bookmarks, settings, downloads list and your saved session are stored encrypted on this device. Websites’ own cookies and cache are kept
        by Chromium (cookies are protected by Windows as well).
      </p>
      <div className="pshield__actions">
        {status?.mode === 'password' ? (
          <>
            <Button icon="lock" onClick={() => setDialog('change')}>
              Change password
            </Button>
            <Button variant="ghost" onClick={() => setDialog('remove')}>
              Remove password
            </Button>
          </>
        ) : (
          <Button icon="lock" onClick={() => setDialog('set')} disabled={status === null}>
            Set a startup password
          </Button>
        )}
      </div>
      {dialog && <PasswordDialog mode={dialog} onClose={() => setDialog(null)} onDone={(m) => { onDone(m); load() }} onError={onError} />}
    </div>
  )
}

function ThreatListRow({ onError, onDone }: { onError: (m: string) => void; onDone: (m: string) => void }) {
  const [status, setStatus] = useState<ThreatListStatus | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => void call('threats.status').then(setStatus, () => undefined), [])
  const update = (): void => {
    setBusy(true)
    call('threats.update')
      .then((s) => {
        setStatus(s)
        onDone(`Protection list updated: ${s.entries.toLocaleString('en-US')} sites`)
      }, (e: Error) => onError(cleanError(e)))
      .finally(() => setBusy(false))
  }
  return (
    <div className="srow__inline">
      <span className="mono srow__meta">
        {status ? `${status.entries.toLocaleString('en-US')} SITES · ${status.source === 'updated' ? 'UPDATED' : 'BUNDLED'} ${status.updatedAt?.slice(0, 10) ?? ''}` : '…'}
      </span>
      <Button icon="reload" onClick={update} disabled={busy}>
        {busy ? 'Updating…' : 'Update now'}
      </Button>
    </div>
  )
}

function UpdatesRow({ settings, update, onDone }: { settings: Settings; update: (p: Partial<Settings>) => void; onDone: (m: string) => void }) {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => void call('update.status').then(setStatus, () => undefined), [])
  const check = (): void => {
    setBusy(true)
    call('update.check')
      .then((s) => {
        setStatus(s)
        if (s.state === 'uptodate') onDone('F2PX is up to date')
      }, () => undefined)
      .finally(() => setBusy(false))
  }
  const text =
    status === null
      ? '…'
      : status.state === 'unconfigured'
        ? 'Update checks are not configured in this build'
        : status.state === 'available'
          ? `Version ${status.latest} is available`
          : status.state === 'uptodate'
            ? 'You have the latest version'
            : status.state === 'error'
              ? status.error ?? 'Could not check'
              : 'Not checked yet'
  return (
    <>
      <Row label="Check for F2PX updates" hint="Asks the update server whether a newer version exists (about once a day). Nothing is downloaded or installed automatically — you get a link to the download page.">
        <Toggle label="Check for updates" checked={settings.checkUpdates} onChange={(checkUpdates) => update({ checkUpdates })} />
      </Row>
      <Row label="Update status" hint={text}>
        <div className="srow__inline">
          {status?.state === 'available' && status.url && (
            <Button variant="primary" icon="external" onClick={() => fire('page.navigate', status.url as string, { newTab: true })}>
              Open download page
            </Button>
          )}
          <Button icon="reload" onClick={check} disabled={busy || status?.state === 'unconfigured'}>
            {busy ? 'Checking…' : 'Check now'}
          </Button>
        </div>
      </Row>
    </>
  )
}

function ClearDataCard({ onDone, onError }: { onDone: (m: string) => void; onError: (m: string) => void }) {
  const [opts, setOpts] = useState<Required<ClearDataOptions>>({ history: true, downloads: false, cookies: false, cache: true })
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const any = Object.values(opts).some(Boolean)

  const run = (): void => {
    setConfirm(false)
    setBusy(true)
    call('privacy.clear', opts).then(
      () => onDone('Selected data cleared'),
      (e: Error) => onError(cleanError(e))
    ).finally(() => setBusy(false))
  }

  return (
    <div className="clearcard">
      <div className="clearcard__grid">
        <Checkbox checked={opts.history} onChange={(history) => setOpts({ ...opts, history })}>
          Browsing history
        </Checkbox>
        <Checkbox checked={opts.downloads} onChange={(downloads) => setOpts({ ...opts, downloads })}>
          Download history
        </Checkbox>
        <Checkbox checked={opts.cookies} onChange={(cookies) => setOpts({ ...opts, cookies })}>
          Cookies &amp; site data
        </Checkbox>
        <Checkbox checked={opts.cache} onChange={(cache) => setOpts({ ...opts, cache })}>
          Cached files
        </Checkbox>
      </div>
      <Button variant="danger" icon="trash" disabled={!any || busy} onClick={() => setConfirm(true)}>
        {busy ? 'Clearing…' : 'Clear data'}
      </Button>
      {confirm && (
        <Dialog title="Clear browsing data" danger submitLabel="Clear" onClose={() => setConfirm(false)} onSubmit={run}>
          <p className="dialog__text">
            {opts.cookies ? 'You will be signed out of most websites. ' : ''}
            This cannot be undone. Downloaded files stay on disk.
          </p>
        </Dialog>
      )}
    </div>
  )
}

export function SettingsPage({ settings, update }: Props) {
  const { toast, node } = useToast()
  const [active, setActive] = useState('general')
  const initialHw = useRef(settings.hardwareAcceleration)
  const chromium = /Chrome\/(\d+)/.exec(navigator.userAgent)?.[1]
  const [stats, setStats] = useState<PrivacyStats | null>(null)

  useEffect(() => {
    const load = (): void => void call('privacy.stats').then(setStats, () => undefined)
    load()
    const timer = window.setInterval(load, 4000)
    return () => window.clearInterval(timer)
  }, [])

  // highlight the nav entry of the section currently in view
  useEffect(() => {
    const root = document.querySelector('.page')
    const sections = [...document.querySelectorAll<HTMLElement>('[data-section]')]
    if (!root || sections.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive((visible[0].target as HTMLElement).dataset.section ?? 'general')
      },
      { root, rootMargin: '-10% 0px -70% 0px' }
    )
    sections.forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [])

  const goTo = (id: string): void => {
    document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActive(id)
  }

  const groups = Array.from(new Set(SHORTCUTS.filter((s) => !/^tab[2-8]$/.test(s.action)).map((s) => s.group)))

  return (
    <PageFrame code="Settings" title="Settings">
      <div className="settings">
        <nav className="snav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className={s.id === active ? 'is-active' : ''} onClick={() => goTo(s.id)}>
              <Icon name={s.icon} size={14} />
              <span>{s.label}</span>
            </button>
          ))}
        </nav>

        <div className="settings__body">
          <Section id="general" title="General">
            <Row label="Home page" hint="Opened by the Home button." stack>
              <HomeUrlControl settings={settings} update={update} />
            </Row>
            <SearchEngineRow settings={settings} update={update} />
            <Row label="On startup" hint="What F2PX opens when it launches.">
              <Segmented
                label="Startup behaviour"
                value={settings.startupBehavior}
                onChange={(startupBehavior) => update({ startupBehavior })}
                options={[
                  { value: 'home', label: 'Open start page' },
                  { value: 'restore', label: 'Restore last session' }
                ]}
              />
            </Row>
          </Section>

          <Section id="start" title="Start page">
            <Row label="Quick access" hint="Shortcut tiles under the search box.">
              <Toggle label="Quick access" checked={settings.quickAccessEnabled} onChange={(quickAccessEnabled) => update({ quickAccessEnabled })} />
            </Row>
            <SearchEngineRow settings={settings} update={update} />
            <Row label="Show clock">
              <div className="srow__inline">
                {settings.showClock && (
                  <Segmented
                    label="Clock format"
                    value={settings.clock24h ? '24' : '12'}
                    onChange={(v) => update({ clock24h: v === '24' })}
                    options={[
                      { value: '24', label: '24 h' },
                      { value: '12', label: '12 h' }
                    ]}
                  />
                )}
                <Toggle label="Show clock" checked={settings.showClock} onChange={(showClock) => update({ showClock })} />
              </div>
            </Row>
            <Row label="Show greeting">
              <div className="srow__inline">
                {settings.showGreeting && (
                  <input
                    className="input srow__name"
                    value={settings.userName}
                    maxLength={40}
                    placeholder="Your name (optional)"
                    onChange={(e) => update({ userName: e.target.value })}
                  />
                )}
                <Toggle label="Show greeting" checked={settings.showGreeting} onChange={(showGreeting) => update({ showGreeting })} />
              </div>
            </Row>
            <BackgroundRow settings={settings} update={update} onError={(m) => toast(m, 'error')} />
            <AccentRow settings={settings} update={update} />
            <Row label="Shortcut tiles" hint="Restores the eight default tiles. Your own tiles are replaced.">
              <Button
                icon="reload"
                onClick={() => call('quickAccess.reset').then(() => toast('Default shortcuts restored'), (e: Error) => toast(cleanError(e), 'error'))}
              >
                Restore defaults
              </Button>
            </Row>
          </Section>

          <Section id="appearance" title="Appearance">
            <Row label="Theme">
              <Segmented
                label="Theme"
                value={settings.theme}
                onChange={(theme) => update({ theme })}
                options={[
                  { value: 'dark', label: 'Dark' },
                  { value: 'light', label: 'Light' },
                  { value: 'system', label: 'System' }
                ]}
              />
            </Row>
            <AccentRow settings={settings} update={update} />
            <BackgroundRow settings={settings} update={update} onError={(m) => toast(m, 'error')} />
            <Row label="Animations" hint="Subtle transitions, tab and menu motion.">
              <Toggle label="Animations" checked={settings.animations} onChange={(animations) => update({ animations })} />
            </Row>
            <Row label="Compact mode" hint="Thinner tab strip and toolbar.">
              <Toggle label="Compact mode" checked={settings.compactMode} onChange={(compactMode) => update({ compactMode })} />
            </Row>
            <Row label="Bookmarks bar" hint="Ctrl+Shift+B toggles it anywhere.">
              <Toggle label="Bookmarks bar" checked={settings.showBookmarksBar} onChange={(showBookmarksBar) => update({ showBookmarksBar })} />
            </Row>
          </Section>

          <Section id="privacy" title="Privacy">
            <div className="pshield">
              <div className="pshield__row">
                <span className="label">Protection</span>
                <span className="pshield__state mono">{settings.trackerBlocking === 'off' ? 'TRACKING PROTECTION OFF' : `TRACKERS: ${settings.trackerBlocking.toUpperCase()}`}{settings.httpsOnly ? ' · HTTPS-ONLY' : ''}</span>
              </div>
              <div className="pshield__count">
                <span className="pshield__num mono">{(stats?.blockedTotal ?? 0).toLocaleString('en-US')}</span>
                <span className="label">trackers blocked so far</span>
              </div>
            </div>
            <Row label="Block trackers" hint="Blocks third-party requests to known advertising, analytics and cross-site tracking hosts. Strict also blocks social widgets and fingerprinting scripts and may break some embeds.">
              <Segmented
                label="Tracker blocking"
                value={settings.trackerBlocking}
                onChange={(trackerBlocking) => update({ trackerBlocking })}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'standard', label: 'Standard' },
                  { value: 'strict', label: 'Strict' }
                ]}
              />
            </Row>
            <Row label="HTTPS-only mode" hint="Opens sites over an encrypted connection. If a site has no secure version you are warned first. Local addresses are exempt.">
              <Toggle label="HTTPS-only mode" checked={settings.httpsOnly} onChange={(httpsOnly) => update({ httpsOnly })} />
            </Row>
            <Row label="Clean tracking parameters" hint="Removes utm_*, fbclid, gclid and similar parameters from links before the page loads.">
              <Toggle label="Clean tracking parameters" checked={settings.stripTrackingParams} onChange={(stripTrackingParams) => update({ stripTrackingParams })} />
            </Row>
            <Row label="Encrypted DNS" hint="Looks up site names over HTTPS so your network provider cannot log which sites you visit. Automatic falls back to normal DNS if the encrypted resolver is blocked; Strict never does.">
              <Segmented
                label="Encrypted DNS"
                value={settings.secureDns}
                onChange={(secureDns) => update({ secureDns })}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'automatic', label: 'Automatic' },
                  { value: 'strict', label: 'Strict' }
                ]}
              />
            </Row>
            {settings.secureDns !== 'off' && (
              <Row label="DNS provider">
                <div className="srow__stack">
                  <Select
                    label="DNS provider"
                    value={settings.dnsProvider}
                    onChange={(dnsProvider) => update({ dnsProvider })}
                    options={[
                      ...(Object.keys(DNS_PROVIDERS) as (keyof typeof DNS_PROVIDERS)[]).map((k) => ({ value: k, label: DNS_PROVIDERS[k].name })),
                      { value: 'custom' as const, label: 'Custom (DoH URL)' }
                    ]}
                  />
                  {settings.dnsProvider === 'custom' && (
                    <input
                      className="input srow__url"
                      defaultValue={settings.dnsCustomUrl}
                      placeholder="https://dns.example.com/dns-query"
                      spellCheck={false}
                      onBlur={(e) => update({ dnsCustomUrl: e.target.value.trim() })}
                    />
                  )}
                </div>
              </Row>
            )}
            <Row label="Malware & phishing protection" hint="Blocks sites from a list of known phishing and malware hosts and warns about look-alike addresses such as paypa1.com. Works offline with a list bundled in F2PX.">
              <Toggle label="Malware and phishing protection" checked={settings.threatProtection} onChange={(threatProtection) => update({ threatProtection })} />
            </Row>
            {settings.threatProtection && (
              <>
                <Row label="Update the protection list" hint="Downloads fresh lists once a day from abuse.ch (URLhaus) and GitHub (Phishing.Database). Off by default because it contacts those servers.">
                  <Toggle label="Update protection list" checked={settings.protectionUpdates} onChange={(protectionUpdates) => update({ protectionUpdates })} />
                </Row>
                <Row label="Protection list">
                  <ThreatListRow onError={(m) => toast(m, 'error')} onDone={toast} />
                </Row>
              </>
            )}
            <Row label="Do Not Track" hint="Sends the DNT and Global Privacy Control signals with every request.">
              <Toggle label="Do Not Track" checked={settings.doNotTrack} onChange={(doNotTrack) => update({ doNotTrack })} />
            </Row>
            <Row label="Search suggestions" hint="Sends what you type in the address bar to the selected search engine while you type. Off by default.">
              <Toggle label="Search suggestions" checked={settings.searchSuggestions} onChange={(searchSuggestions) => update({ searchSuggestions })} />
            </Row>
            <Row label="Spell check" hint="On Windows the dictionaries are downloaded from Google servers the first time it is used, so it is off by default.">
              <Toggle label="Spell check" checked={settings.spellcheck} onChange={(spellcheck) => update({ spellcheck })} />
            </Row>
            <Row label="Chrome compatibility" hint="Identifies the browser to websites as Chrome, so sites that block unknown browsers (for example Google sign-in) accept it. Applies to newly opened tabs. Turn it off for the most neutral identity.">
              <Toggle label="Chrome compatibility" checked={settings.chromeCompat} onChange={(chromeCompat) => update({ chromeCompat })} />
            </Row>
            <Row label="Clear cookies when F2PX closes" hint="Cookies, local storage and cache are removed every time you quit.">
              <Toggle label="Clear cookies on exit" checked={settings.clearCookiesOnExit} onChange={(clearCookiesOnExit) => update({ clearCookiesOnExit })} />
            </Row>
            <Row label="Clear history when F2PX closes" hint="Browsing history, download history and the saved session are removed every time you quit.">
              <Toggle label="Clear history on exit" checked={settings.clearHistoryOnExit} onChange={(clearHistoryOnExit) => update({ clearHistoryOnExit })} />
            </Row>
            <Row label="Clear browsing data now" hint="Removes data stored on this device." stack>
              <ClearDataCard onDone={toast} onError={(m) => toast(m, 'error')} />
            </Row>
            <Row label="Private window" hint="History, cookies and cache are discarded when the last private window closes.">
              <kbd className="kbd">Ctrl + Shift + N</kbd>
            </Row>
          </Section>

          <Section id="security" title="Security">
            <SecurityCard onDone={toast} onError={(m) => toast(m, 'error')} />
            <Row label="Sandboxed pages" hint="Every tab runs in an isolated, sandboxed process with no access to your files.">
              <span className="chip chip--completed">Always on</span>
            </Row>
            <Row label="Certificate errors" hint="Sites with an untrusted certificate are blocked; you can continue only per site and only until F2PX closes.">
              <span className="chip chip--completed">Always on</span>
            </Row>
            <Row label="Downloaded files" hint="Every download is tagged as coming from the Internet (Windows SmartScreen / Defender check it), and programs disguised as documents are flagged.">
              <span className="chip chip--completed">Always on</span>
            </Row>
            <Row label="Downloaded programs" hint="Executable files always ask for confirmation before they run.">
              <span className="chip chip--completed">Always on</span>
            </Row>
          </Section>

          <Section id="downloads" title="Downloads">
            <Row label="Download location" hint="Default: %USERPROFILE%\Downloads\F2PX" stack>
              <div className="srow__stack">
                <Segmented
                  label="Download location"
                  value={settings.downloadMode}
                  onChange={(downloadMode) => {
                    if (downloadMode === 'custom' && !settings.downloadPath) {
                      call('settings.pickDownloadFolder').catch((e: Error) => toast(cleanError(e), 'error'))
                    } else update({ downloadMode })
                  }}
                  options={[
                    { value: 'default', label: 'Default folder' },
                    { value: 'ask', label: 'Ask every time' },
                    { value: 'custom', label: 'Custom folder' }
                  ]}
                />
                {settings.downloadMode === 'custom' && (
                  <div className="srow__inline">
                    <span className="pathbox mono" title={settings.downloadPath}>
                      {settings.downloadPath || '—'}
                    </span>
                    <Button icon="folder" onClick={() => call('settings.pickDownloadFolder').catch((e: Error) => toast(cleanError(e), 'error'))}>
                      Change
                    </Button>
                  </div>
                )}
              </div>
            </Row>
            <Row label="Download notifications" hint="Windows notification when a download finishes.">
              <Toggle label="Download notifications" checked={settings.downloadNotifications} onChange={(downloadNotifications) => update({ downloadNotifications })} />
            </Row>
          </Section>

          <Section id="system" title="System">
            <Row label="Start with Windows" hint="Launch F2PX when you sign in (installed version only).">
              <Toggle label="Start with Windows" checked={settings.startWithWindows} onChange={(startWithWindows) => update({ startWithWindows })} />
            </Row>
            <Row label="Minimize to tray" hint="Minimizing hides the window in the system tray. Click the tray icon to bring it back.">
              <Toggle label="Minimize to tray" checked={settings.minimizeToTray} onChange={(minimizeToTray) => update({ minimizeToTray })} />
            </Row>
            <Row label="Hardware acceleration" hint="Uses the GPU to render pages. Turn off if you see graphical glitches.">
              <div className="srow__inline">
                {settings.hardwareAcceleration !== initialHw.current && (
                  <Button variant="primary" icon="reload" onClick={() => fire('app.restart')}>
                    Restart to apply
                  </Button>
                )}
                <Toggle label="Hardware acceleration" checked={settings.hardwareAcceleration} onChange={(hardwareAcceleration) => update({ hardwareAcceleration })} />
              </div>
            </Row>
          </Section>

          <Section id="shortcuts" title="Shortcuts">
            <div className="skeys">
              {groups.map((group) => (
                <div key={group} className="skeys__group">
                  <div className="label skeys__title">{group}</div>
                  {SHORTCUTS.filter((s) => s.group === group && !/^tab[2-8]$/.test(s.action)).map((s) => (
                    <div key={s.action} className="skeys__row">
                      <span>{s.label}</span>
                      <kbd className="kbd">{s.display}</kbd>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Section>

          <Section id="about" title="About">
            <UpdatesRow settings={settings} update={update} onDone={toast} />
            <div className="about">
              <div className="about__row mono">
                <span>F2PX BROWSER</span>
                <span>v{__APP_VERSION__}</span>
              </div>
              <div className="about__row mono">
                <span>ENGINE</span>
                <span>Chromium {chromium ?? '—'}</span>
              </div>
              <p className="about__text">
                Everything — history, bookmarks, settings, downloads and sessions — is stored locally on this device. F2PX has no account and sends
                nothing to any server of its own.
              </p>
            </div>
          </Section>
        </div>
      </div>
      {node}
    </PageFrame>
  )
}

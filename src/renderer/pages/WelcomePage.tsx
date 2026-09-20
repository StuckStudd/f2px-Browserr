import { useState } from 'react'
import type { SearchEngineId, Settings, ThemeMode } from '@shared/types'
import { Button, Toggle } from '@renderer/components/Controls'
import { Icon } from '@renderer/components/Icon'
import { LogoMark } from '@renderer/components/Logo'
import { call, fire } from '@renderer/lib/api'

interface Props {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

type Preset = 'recommended' | 'maximum' | 'relaxed'

const STEPS = ['Welcome', 'Profile', 'Appearance', 'Search', 'Privacy', 'Finish'] as const

const ENGINES: { id: SearchEngineId; name: string; note: string; recommended?: boolean }[] = [
  { id: 'duckduckgo', name: 'DuckDuckGo', note: 'Does not build a profile of you or keep your search history.', recommended: true },
  { id: 'brave', name: 'Brave Search', note: 'Independent search index, no user tracking.' },
  { id: 'google', name: 'Google', note: 'The most complete results. Google collects data about your searches.' },
  { id: 'bing', name: 'Bing', note: 'Microsoft search. Microsoft collects data about your searches.' }
]

const THEMES: { id: ThemeMode; name: string; note: string }[] = [
  { id: 'dark', name: 'Dark', note: 'The F2PX look' },
  { id: 'light', name: 'Light', note: 'Bright and clean' },
  { id: 'system', name: 'System', note: 'Follow Windows' }
]

const PRESETS: Record<Preset, { name: string; note: string; patch: Partial<Settings> }> = {
  recommended: {
    name: 'Recommended',
    note: 'Blocks known trackers, opens sites over HTTPS, encrypts DNS and cleans tracking parameters from links.',
    patch: { trackerBlocking: 'standard', httpsOnly: true, secureDns: 'automatic', stripTrackingParams: true, clearCookiesOnExit: false }
  },
  maximum: {
    name: 'Maximum',
    note: 'Everything above, plus strict tracker blocking, DNS that never falls back, and cookies cleared every time you quit. Some sites may break.',
    patch: { trackerBlocking: 'strict', httpsOnly: true, secureDns: 'strict', stripTrackingParams: true, clearCookiesOnExit: true }
  },
  relaxed: {
    name: 'Relaxed',
    note: 'Standard tracker blocking and encrypted DNS with fallback. HTTPS-only is off so old sites always open.',
    patch: { trackerBlocking: 'standard', httpsOnly: false, secureDns: 'automatic', stripTrackingParams: true, clearCookiesOnExit: false }
  }
}

const SIGN_IN: { id: string; name: string; url: string }[] = [
  { id: 'google', name: 'Google', url: 'https://accounts.google.com/signin' },
  { id: 'microsoft', name: 'Microsoft', url: 'https://login.live.com/' },
  { id: 'yandex', name: 'Yandex', url: 'https://passport.yandex.ru/auth' },
  { id: 'github', name: 'GitHub', url: 'https://github.com/login' }
]

/** First-run wizard: profile, theme, search engine, privacy level, optional sign-in shortcuts. */
export function WelcomePage({ settings, update }: Props) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState(settings.userName)
  const [lock, setLock] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [preset, setPreset] = useState<Preset>('recommended')
  const [signIn, setSignIn] = useState<string[]>([])
  const [refresh, setRefresh] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const passwordProblem = !lock ? '' : password.length < 8 ? 'Use at least 8 characters.' : password !== confirm ? 'The passwords do not match.' : ''
  const last = step === STEPS.length - 1

  const applyPreset = (p: Preset): void => {
    setPreset(p)
    update(PRESETS[p].patch)
  }

  const finish = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      update({ userName: name.trim(), onboarded: true, threatProtection: true, protectionUpdates: refresh, checkUpdates: refresh, ...PRESETS[preset].patch })
      if (lock && !passwordProblem) await call('security.setPassword', '', password)
      for (const site of SIGN_IN.filter((s) => signIn.includes(s.id))) fire('page.navigate', site.url, { newTab: true })
      fire('page.navigate', 'f2px://home')
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not finish setup')
      setBusy(false)
    }
  }

  const skip = (): void => {
    update({ onboarded: true })
    fire('page.navigate', 'f2px://home')
  }

  const next = (): void => {
    if (step === 1 && passwordProblem) return setError(passwordProblem)
    setError('')
    setStep((s) => s + 1)
  }

  return (
    <div className="welcome">
      <div className="page__bg" aria-hidden="true" />
      <div className="welcome__frame" aria-hidden="true" />

      <header className="welcome__top">
        <span className="label">F2PX / Setup</span>
        <div className="welcome__steps" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span key={s} className={i === step ? 'is-active' : i < step ? 'is-done' : ''} title={s} />
          ))}
        </div>
        <button type="button" className="welcome__skip" onClick={skip}>
          Skip
        </button>
      </header>

      <main className="welcome__body" key={step}>
        {step === 0 && (
          <>
            <div className="welcome__mark">
              <LogoMark size={64} />
            </div>
            <h1 className="welcome__logo">F2PX</h1>
            <p className="welcome__slogan">Your web. Your space.</p>
            <p className="welcome__lead">
              Let’s set up your browser. It takes a minute, and everything can be changed later in Settings. F2PX keeps your data on this device and
              encrypts it.
            </p>
            <ul className="welcome__points">
              <li>
                <Icon name="lock" size={14} /> Local data is encrypted
              </li>
              <li>
                <Icon name="shield" size={14} /> Trackers blocked, HTTPS-only
              </li>
              <li>
                <Icon name="check" size={14} /> No account, no telemetry
              </li>
            </ul>
          </>
        )}

        {step === 1 && (
          <>
            <p className="label welcome__step">01 / Profile</p>
            <h2 className="welcome__title">Who is this browser for?</h2>
            <p className="welcome__lead">F2PX has no cloud account. Your profile lives only on this computer.</p>
            <label className="field welcome__field">
              <span className="label">Your name (optional)</span>
              <input className="input" value={name} maxLength={40} placeholder="Shown in the start-page greeting" onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="welcome__card">
              <div className="welcome__card-row">
                <div>
                  <div className="welcome__card-title">Protect F2PX with a password</div>
                  <div className="welcome__card-note">Asked every time the browser starts. Good on a shared computer.</div>
                </div>
                <Toggle label="Protect with a password" checked={lock} onChange={setLock} />
              </div>
              {lock && (
                <div className="welcome__lock">
                  <input className="input" type="password" value={password} placeholder="Password (8+ characters)" autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
                  <input className="input" type="password" value={confirm} placeholder="Repeat password" autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} />
                  <p className="welcome__warn">
                    Your data is encrypted with this password. <b>If you forget it, it cannot be recovered</b> — the only way back in is to erase everything.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="label welcome__step">02 / Appearance</p>
            <h2 className="welcome__title">Choose a theme</h2>
            <div className="welcome__options welcome__options--row">
              {THEMES.map((t) => (
                <button key={t.id} type="button" className={`opt ${settings.theme === t.id ? 'is-selected' : ''}`} onClick={() => update({ theme: t.id })} aria-pressed={settings.theme === t.id}>
                  <span className={`opt__swatch opt__swatch--${t.id}`} />
                  <span className="opt__name">{t.name}</span>
                  <span className="opt__note">{t.note}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p className="label welcome__step">03 / Search</p>
            <h2 className="welcome__title">Choose a search engine</h2>
            <p className="welcome__lead">We recommend DuckDuckGo. You can switch any time in Settings.</p>
            <div className="welcome__options">
              {ENGINES.map((e) => (
                <button key={e.id} type="button" className={`opt opt--wide ${settings.searchEngine === e.id ? 'is-selected' : ''}`} onClick={() => update({ searchEngine: e.id })} aria-pressed={settings.searchEngine === e.id}>
                  <span className="opt__name">
                    {e.name}
                    {e.recommended && <span className="opt__badge">Recommended</span>}
                  </span>
                  <span className="opt__note">{e.note}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <p className="label welcome__step">04 / Privacy</p>
            <h2 className="welcome__title">How private should it be?</h2>
            <div className="welcome__options">
              {(Object.keys(PRESETS) as Preset[]).map((p) => (
                <button key={p} type="button" className={`opt opt--wide ${preset === p ? 'is-selected' : ''}`} onClick={() => applyPreset(p)} aria-pressed={preset === p}>
                  <span className="opt__name">
                    {PRESETS[p].name}
                    {p === 'recommended' && <span className="opt__badge">Default</span>}
                  </span>
                  <span className="opt__note">{PRESETS[p].note}</span>
                </button>
              ))}
            </div>
            <div className="welcome__toggle">
              <div>
                <span className="opt__name">Keep protection up to date</span>
                <span className="opt__note">
                  Phishing and malware protection is always on and works offline. This lets F2PX refresh its list of dangerous sites and check for a new version once a day — it
                  contacts abuse.ch, GitHub and the update server, and sends no personal data. You can change it in Settings.
                </span>
              </div>
              <Toggle label="Keep protection up to date" checked={refresh} onChange={setRefresh} />
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <p className="label welcome__step">05 / Ready</p>
            <h2 className="welcome__title">You’re all set</h2>
            <p className="welcome__lead">Optionally open the sign-in page of services you use. F2PX never sees or stores your password — you sign in on the site itself.</p>
            <div className="welcome__options welcome__options--row welcome__options--tight">
              {SIGN_IN.map((s) => {
                const on = signIn.includes(s.id)
                return (
                  <button key={s.id} type="button" className={`opt opt--small ${on ? 'is-selected' : ''}`} aria-pressed={on} onClick={() => setSignIn(on ? signIn.filter((x) => x !== s.id) : [...signIn, s.id])}>
                    <span className="opt__name">{s.name}</span>
                  </button>
                )
              })}
            </div>
            <ul className="welcome__summary mono">
              <li>Theme · {settings.theme}</li>
              <li>Search · {ENGINES.find((e) => e.id === settings.searchEngine)?.name}</li>
              <li>Privacy · {PRESETS[preset].name}</li>
              <li>Protection · phishing &amp; malware filter on{refresh ? ' · auto-updates' : ''}</li>
              <li>Password · {lock ? 'on' : 'off'} · data encrypted</li>
            </ul>
          </>
        )}
      </main>

      {error && <div className="welcome__error" role="alert">{error}</div>}

      <footer className="welcome__nav">
        <Button variant="ghost" disabled={step === 0 || busy} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          Back
        </Button>
        {last ? (
          <Button variant="primary" disabled={busy} onClick={() => void finish()}>
            {busy ? 'Saving…' : 'Start browsing'}
          </Button>
        ) : (
          <Button variant="primary" onClick={next}>
            {step === 0 ? 'Get started' : 'Continue'}
          </Button>
        )}
      </footer>
    </div>
  )
}

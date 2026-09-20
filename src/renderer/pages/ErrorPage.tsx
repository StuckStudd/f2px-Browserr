import { useEffect, useState } from 'react'
import { hostOf, isWebUrl, type ErrorKind } from '@shared/url'
import { Button } from '@renderer/components/Controls'
import { Icon } from '@renderer/components/Icon'
import { LogoMark } from '@renderer/components/Logo'
import { call } from '@renderer/lib/api'

interface Copy {
  title: string
  message: (host: string) => string
  tips: string[]
}

const COPY: Record<ErrorKind, Copy> = {
  connection: {
    title: 'Connection lost',
    message: () => "F2PX couldn't reach this page.",
    tips: ['Check your network connection', 'Check the address for typos', 'The site may be temporarily down']
  },
  dns: {
    title: 'DNS error',
    message: (host) => `The address of ${host || 'this site'} could not be found.`,
    tips: ['Check the address for typos', 'Try again in a few minutes', 'Check your DNS or proxy settings']
  },
  offline: {
    title: 'Offline',
    message: () => "You're not connected to the internet.",
    tips: ['Check your cables, Wi-Fi or mobile data', 'The page reloads automatically when you are back online']
  },
  crash: {
    title: 'Page crashed',
    message: () => 'This page stopped responding and was closed.',
    tips: ['Reload the page to try again', 'Close other tabs to free up memory']
  },
  certificate: {
    title: 'Certificate error',
    message: (host) => `The security certificate of ${host || 'this site'} can't be trusted.`,
    tips: ['Someone may be trying to intercept your connection', 'Check that your computer date and time are correct']
  },
  httpsonly: {
    title: 'HTTPS-only mode',
    message: (host) => `${host || 'This site'} does not support a secure connection.`,
    tips: [
      'F2PX tried the secure (https://) version of this address and could not connect',
      'Over plain HTTP anyone on the network can read or change what you send and receive',
      'Do not enter passwords or personal data on a site you continue to over HTTP'
    ]
  },
  threat: {
    title: 'Dangerous site blocked',
    message: (host) => `${host || 'This site'} is on a list of known phishing and malware sites.`,
    tips: [
      'Attackers use such sites to steal passwords and infect computers',
      'Do not enter passwords or download anything from this address',
      'If you are certain the site is safe, you can continue anyway'
    ]
  },
  generic: {
    title: 'Page failed to load',
    message: () => 'Something went wrong while loading this page.',
    tips: ['Reload the page to try again']
  }
}

const KINDS = Object.keys(COPY) as ErrorKind[]

export function ErrorPage() {
  const params = new URLSearchParams(window.location.search)
  const rawKind = params.get('type') as ErrorKind | null
  const kind: ErrorKind = rawKind && KINDS.includes(rawKind) ? rawKind : 'generic'
  const target = params.get('url') ?? ''
  const detail = params.get('detail') ?? ''
  const code = params.get('code')
  const host = hostOf(target)
  const base = COPY[kind]
  const lookBrand = detail.startsWith('lookalike:') ? detail.slice('lookalike:'.length) : ''
  const threatKind = kind === 'threat' ? (lookBrand ? 'lookalike' : detail === 'idn' ? 'idn' : 'listed') : null
  const copy =
    threatKind === 'lookalike'
      ? {
          title: 'Suspicious address',
          message: (h: string) => `${h} looks like ${lookBrand} but it is a different website.`,
          tips: ['Attackers register look-alike names to steal logins', `If you wanted ${lookBrand}, type its address yourself or use a bookmark`, 'Check the address letter by letter before you continue']
        }
      : threatKind === 'idn'
        ? {
            title: 'Deceptive address',
            message: (h: string) => `${h} mixes letters from different alphabets that look alike.`,
            tips: ['Such names are used to imitate well-known websites', 'Do not sign in or enter payment details here']
          }
        : base
  const safeTarget = isWebUrl(target) ? target : ''
  const [advanced, setAdvanced] = useState(false)

  // Always lands somewhere known-good; going "back" could just return to the page that linked here.
  const goSafe = (): void => window.location.replace('f2px://home')

  const retry = (): void => {
    if (safeTarget) window.location.replace(safeTarget)
    else window.history.back()
  }

  // an offline error resolves itself as soon as the connection returns
  useEffect(() => {
    if (kind !== 'offline' || !safeTarget) return
    const onOnline = (): void => window.location.replace(safeTarget)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [kind, safeTarget])

  const proceed = (): void => {
    const method = kind === 'httpsonly' ? 'page.allowHttp' : kind === 'threat' ? 'page.allowThreat' : 'page.proceedCertificate'
    call(method, safeTarget).then(retry, () => undefined)
  }

  return (
    <div className="errpage">
      <div className="page__bg" aria-hidden="true" />
      <div className="errpage__frame" aria-hidden="true" />
      <div className="errpage__mark">
        <LogoMark size={22} />
        <span className="label">F2PX / Error</span>
      </div>

      <main className="errpage__body">
        <svg className="errpage__glyph" viewBox="0 0 120 120" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="1.2">
            <circle cx="60" cy="60" r="46" opacity=".35" strokeDasharray="2 6" />
            <circle cx="60" cy="60" r="30" opacity=".6" />
            <path d="M12 60h30M78 60h30M60 12v30M60 78v30" opacity=".5" />
            <path d="M46 46l28 28M74 46L46 74" strokeWidth="1.6" />
          </g>
        </svg>
        <h1 className="errpage__title">{copy.title}</h1>
        <p className="errpage__message">{copy.message(host)}</p>
        {target && <p className="errpage__url mono">{target}</p>}

        <div className="errpage__actions">
          {kind === 'threat' ? (
            <Button variant="primary" onClick={goSafe}>
              Back to safety
            </Button>
          ) : (
            <Button variant="primary" icon="reload" onClick={retry}>
              {kind === 'crash' ? 'Reload' : 'Retry'}
            </Button>
          )}
          {kind === 'certificate' && (
            <Button variant="ghost" onClick={() => window.history.length > 1 && window.history.back()}>
              Back to safety
            </Button>
          )}
        </div>

        <ul className="errpage__tips">
          {copy.tips.map((tip) => (
            <li key={tip}>
              <Icon name="chevronRight" size={11} />
              {tip}
            </li>
          ))}
        </ul>

        {(kind === 'certificate' || kind === 'httpsonly' || kind === 'threat') && safeTarget && (
          <div className="errpage__advanced">
            <button type="button" className="errpage__toggle" onClick={() => setAdvanced((v) => !v)}>
              {advanced ? 'Hide' : 'Advanced'}
            </button>
            {advanced && (
              <div className="errpage__unsafe">
                {kind === 'threat' ? (
                  <p>
                    <span className="mono">{host}</span> may try to steal your passwords or install malware. Continue only if you are absolutely sure it is what you
                    expect.
                  </p>
                ) : kind === 'httpsonly' ? (
                  <p>
                    Continuing sends everything to <span className="mono">{host}</span> without encryption. Only do this for pages you do not
                    mind others seeing.
                  </p>
                ) : (
                  <p>
                    F2PX cannot verify that <span className="mono">{host}</span> is who it claims to be. Continuing is unsafe: passwords and other data
                    you enter could be stolen.
                  </p>
                )}
                <Button variant="danger" onClick={proceed}>
                  {kind === 'httpsonly' ? `Continue to ${host} over HTTP (unsafe)` : kind === 'threat' ? `Continue to ${host} anyway (unsafe)` : `Proceed to ${host} (unsafe)`}
                </Button>
              </div>
            )}
          </div>
        )}

        <p className="errpage__code mono">
          {code ? `ERR ${code}` : ''}
          {code && detail && kind !== 'threat' ? ' · ' : ''}
          {kind !== 'threat' && detail}
        </p>
      </main>
    </div>
  )
}

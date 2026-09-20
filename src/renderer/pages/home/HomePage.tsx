import { useEffect, useState } from 'react'
import { SEARCH_ENGINES } from '@shared/settings'
import { detectPrivacyLevel } from '@shared/privacy'
import type { AppEnv, PrivacyStats, Settings, UpdateStatus } from '@shared/types'
import { useToast } from '@renderer/components/Toast'
import { call, fire } from '@renderer/lib/api'
import { formatClock, greeting } from '@renderer/lib/format'
import { HomeDecor } from './HomeDecor'
import { QuickAccess } from './QuickAccess'
import { SearchBox } from './SearchBox'

function useNow(enabled: boolean): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!enabled) return
    const tick = (): void => setNow(new Date())
    const id = window.setInterval(tick, 10_000)
    return () => window.clearInterval(id)
  }, [enabled])
  return now
}

export function HomePage({ settings }: { settings: Settings }) {
  const [env, setEnv] = useState<AppEnv | null>(null)
  const [stats, setStats] = useState<PrivacyStats | null>(null)
  const [update, setUpdate] = useState<UpdateStatus | null>(null)
  const now = useNow(settings.showClock || settings.showGreeting)
  const { toast, node } = useToast()

  useEffect(() => {
    call('page.env').then(setEnv, () => undefined)
    call('privacy.stats').then(setStats, () => undefined)
    call('update.status').then(setUpdate, () => undefined)
  }, [])

  const level = detectPrivacyLevel(settings)
  const custom = settings.background === 'custom' && settings.backgroundImage
  const hello = greeting(now.getHours()).toUpperCase()
  const name = settings.userName.trim().toUpperCase()

  return (
    <div className="home">
      <div className="home__bg" aria-hidden="true">
        {custom && <div className="home__image" style={{ backgroundImage: `url("f2px://userdata/${settings.backgroundImage}")` }} />}
        {custom && <div className="home__shade" />}
        <div className="home__grid" />
        {!custom && <HomeDecor />}
      </div>
      <div className="home__frame" aria-hidden="true" />

      <div className="home__meta home__meta--tl label">
        System / Home{env?.isTor ? ' · Tor' : env?.isPrivate ? ' · Private' : ''}
      </div>
      {settings.showClock && (
        <div className="home__meta home__meta--tr">
          <div className="home__clock mono">{formatClock(now, !settings.clock24h)}</div>
          <div className="label">{now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}</div>
        </div>
      )}

      <main className="home__center">
        <h1 className="home__logo">F2PX</h1>
        <p className="home__slogan">Your web. Your space.</p>
        {settings.showGreeting && (
          <p className="home__greeting">
            {hello}
            {name && <>, <span>{name}</span></>}
          </p>
        )}
        <SearchBox engine={settings.searchEngine} />
        {env?.isTor ? (
          <p className="home__private">
            Tor window. All traffic goes through the Tor network with the strictest shield; nothing is kept when the last one closes.
          </p>
        ) : (
          env?.isPrivate && (
            <p className="home__private">
              Private window. History and cookies are discarded when the last private window closes.
            </p>
          )
        )}
        {settings.quickAccessEnabled && <QuickAccess onMessage={toast} />}
      </main>

      <a
        className="home__meta home__meta--bc label home__protection"
        href="f2px://privacy"
        title="Open the Privacy center"
        onClick={(e) => {
          e.preventDefault()
          fire('page.navigate', 'f2px://privacy')
        }}
      >
        Privacy / {env?.isTor ? 'tor window' : level === 'custom' ? 'custom' : level}
        {!env?.isTor && settings.proxyMode === 'tor' ? ' · via tor' : ''}
        {settings.trackerBlocking === 'off' ? ' · trackers off' : ''}
        {settings.httpsOnly ? ' · https-only' : ''}
        {stats && stats.blockedTotal > 0 ? ` · ${stats.blockedTotal.toLocaleString('en-US')} blocked` : ''}
      </a>
      {update?.state === 'available' && update.url && (
        <a className="home__update label" href={update.url} onClick={(e) => { e.preventDefault(); fire('page.navigate', update.url as string, { newTab: true }) }}>
          Update / v{update.latest} available →
        </a>
      )}
      <div className="home__meta home__meta--bl label">F2PX Browser{env ? ` · v${env.version}` : ''} · Local data only</div>
      <div className="home__meta home__meta--br label">Engine / {SEARCH_ENGINES[settings.searchEngine].name}</div>
      {node}
    </div>
  )
}

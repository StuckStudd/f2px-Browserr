import type { WebContents } from 'electron'

/**
 * Things only the DevTools protocol can change consistently for a page *and* every iframe / worker inside it:
 *  - "Chrome compatibility": Client Hints brands and `window.chrome`, so sites like Google sign-in accept the browser;
 *  - strict fingerprint protection: UTC time zone, en-US locale and language, so those never identify the user.
 * Cross-site iframes are separate targets; they are attached while paused, configured, and only then let run.
 *
 * Note: a compatibility / privacy measure, not a guarantee. Sites may change their checks at any time.
 */
export interface EmulationOptions {
  chromeCompat: boolean
  /** UTC, en-US. */
  neutralLocale: boolean
}

const CHROME_SHIM = `(() => {
  const c = window.chrome || (window.chrome = {});
  if (!c.app) c.app = {
    isInstalled: false,
    InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
    RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
    getDetails() { return null }, getIsInstalled() { return false },
    installState(cb) { cb && cb('not_installed') }, runningState() { return 'cannot_run' }
  };
  if (!c.csi) c.csi = () => ({ onloadT: Date.now(), startE: Math.round(performance.timeOrigin), pageT: performance.now(), tran: 15 });
  if (!c.loadTimes) c.loadTimes = () => ({
    requestTime: performance.timeOrigin / 1000, startLoadTime: performance.timeOrigin / 1000,
    commitLoadTime: performance.timeOrigin / 1000, finishDocumentLoadTime: 0, finishLoadTime: 0,
    firstPaintTime: 0, firstPaintAfterLoadTime: 0, navigationType: 'Other', wasFetchedViaSpdy: true,
    wasNpnNegotiated: true, npnNegotiatedProtocol: 'h2', wasAlternateProtocolAvailable: false, connectionInfo: 'h2'
  });
})();`

const NEUTRAL_LANGUAGE = 'en-US,en'
const TARGETS_NEEDING_PAGE_API = new Set(['page', 'iframe'])

/** Resolves when the settings are in place (immediately when there is nothing to emulate). */
export function applyEmulation(wc: WebContents, options: EmulationOptions): Promise<void> {
  if (!options.chromeCompat && !options.neutralLocale) return Promise.resolve()
  return attach(wc, options)
}

async function attach(wc: WebContents, options: EmulationOptions): Promise<void> {
  try {
    if (wc.isDestroyed()) return
    const dbg = wc.debugger
    if (!dbg.isAttached()) dbg.attach('1.3')

    const send = async (method: string, params: object, sessionId?: string): Promise<void> => {
      try {
        await dbg.sendCommand(method, params, sessionId)
      } catch (error) {
        /* one unsupported command must not stop the rest */
        if (process.env['F2PX_DEBUG_EMU']) console.warn('[emulation]', method, error instanceof Error ? error.message : error)
      }
    }

    const full = process.versions.chrome
    const major = full.split('.')[0]
    const userAgentOverride = (): object => ({
      userAgent: wc.getUserAgent().replace(/\s(?:Electron|F2PX[\w.-]*)\/[\d.]+/gi, ''),
      ...(options.neutralLocale ? { acceptLanguage: NEUTRAL_LANGUAGE } : {}),
      userAgentMetadata: {
        brands: [
          { brand: 'Not?A_Brand', version: '24' },
          { brand: 'Chromium', version: major },
          ...(options.chromeCompat ? [{ brand: 'Google Chrome', version: major }] : [])
        ],
        fullVersionList: [
          { brand: 'Not?A_Brand', version: '24.0.0.0' },
          { brand: 'Chromium', version: full },
          ...(options.chromeCompat ? [{ brand: 'Google Chrome', version: full }] : [])
        ],
        fullVersion: full,
        platform: 'Windows',
        platformVersion: '15.0.0',
        architecture: 'x86',
        model: '',
        mobile: false,
        bitness: '64',
        wow64: false
      }
    })

    /**
     * Applies everything to the page (no sessionId) or to an attached child target. All commands are sent at once: the first
     * page starts loading right after this, and every command must already be on its way by then.
     */
    const configure = async (type: string, sessionId?: string): Promise<void> => {
      const pending: Promise<void>[] = [send('Emulation.setUserAgentOverride', userAgentOverride(), sessionId)]
      if (options.neutralLocale) {
        pending.push(send('Emulation.setTimezoneOverride', { timezoneId: 'UTC' }, sessionId))
        pending.push(send('Emulation.setLocaleOverride', { locale: 'en-US' }, sessionId))
      }
      if (options.chromeCompat && TARGETS_NEEDING_PAGE_API.has(type)) {
        pending.push(send('Page.enable', {}, sessionId))
        pending.push(send('Page.addScriptToEvaluateOnNewDocument', { source: CHROME_SHIM, runImmediately: true }, sessionId))
      }
      await Promise.all(pending)
    }

    const autoAttach = (sessionId?: string): Promise<void> =>
      send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId)

    dbg.on('message', (_event, method, params: { sessionId?: string; waitingForDebugger?: boolean; targetInfo?: { type?: string } }) => {
      if (method !== 'Target.attachedToTarget' || !params.sessionId) return
      const child = params.sessionId
      const type = params.targetInfo?.type ?? ''
      void (async () => {
        try {
          await configure(type, child)
          if (type === 'iframe' || type === 'page') await autoAttach(child)
        } finally {
          // Whatever happened above, the paused frame or worker must be released or it would hang.
          if (params.waitingForDebugger) await send('Runtime.runIfWaitingForDebugger', {}, child)
        }
      })()
    })

    await Promise.all([configure('page'), autoAttach()])
  } catch (error) {
    // Never let a compatibility tweak break the tab.
    console.warn('[emulation] not applied', error)
  }
}

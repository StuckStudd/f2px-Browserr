import type { WebContents } from 'electron'

/**
 * "Chrome compatibility": some sites (Google sign-in in particular) reject Chromium-based apps that do not
 * look like Google Chrome. This makes a tab report Chrome's Client Hints brands and the `window.chrome`
 * helpers a regular Chrome page exposes. It is opt-out in Settings and only applies to newly opened tabs.
 *
 * Note: this is a compatibility measure, not a guarantee. Sites may change their checks at any time.
 */

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

export async function applyChromeCompat(wc: WebContents): Promise<void> {
  try {
    if (wc.isDestroyed()) return
    const full = process.versions.chrome
    const major = full.split('.')[0]
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
    await wc.debugger.sendCommand('Emulation.setUserAgentOverride', {
      userAgent: wc.getUserAgent(),
      userAgentMetadata: {
        brands: [
          { brand: 'Not?A_Brand', version: '24' },
          { brand: 'Chromium', version: major },
          { brand: 'Google Chrome', version: major }
        ],
        fullVersionList: [
          { brand: 'Not?A_Brand', version: '24.0.0.0' },
          { brand: 'Chromium', version: full },
          { brand: 'Google Chrome', version: full }
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
    await wc.debugger.sendCommand('Page.enable')
    await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: CHROME_SHIM, runImmediately: true })
  } catch (error) {
    // Never let a compatibility tweak break the tab.
    console.warn('[chrome-compat] not applied', error)
  }
}

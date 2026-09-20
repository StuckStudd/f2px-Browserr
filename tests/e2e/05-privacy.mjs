import fs from 'node:fs'
import path from 'node:path'
import { launch, shellConn, waitFor, check, summary, sleep, startServer, targets, connect, browserClose, killAll, mainProcess, TMP } from '../helpers/harness.mjs'

const PORT = 9353
const userData = path.join(TMP, 'ud-e2e-privacy')
fs.rmSync(userData, { recursive: true, force: true })
const server = await startServer()
// Map tracker-looking host names to the local test server so real tracker rules can be exercised offline.
const MAP = ['doubleclick.net', 'b.scorecardresearch.com', 'platform.twitter.com', 'cdn.example.test', 'example.test', 'doubleclick.net']
const rules = `--host-resolver-rules=${MAP.map((h) => `MAP ${h} 127.0.0.1`).join(',')}`
let app = launch(userData, PORT, 9236, [rules])
let shell, main
const conns = []
const rpcOf = (sh) => (m, ...a) => sh.eval(`window.f2pxShell.rpc(${JSON.stringify(m)}, ...${JSON.stringify(a)})`)

try {
  shell = await waitFor(async () => shellConn(), 25000, 500)
  main = await mainProcess(9236)
  const rpc = rpcOf(shell)
  const state = () => rpc('shell.state')
  const activeTab = async () => { const s = await state(); return s.tabs.find((t) => t.id === s.activeId) }
  await waitFor(async () => (await state()).tabs.length)

  // ── defaults are privacy-first
  const d = await rpc('settings.get')
  check('defaults: DuckDuckGo, trackers standard, HTTPS-only, DNT, suggestions off, spell check off',
    d.searchEngine === 'duckduckgo' && d.trackerBlocking === 'standard' && d.httpsOnly && d.doNotTrack && !d.searchSuggestions && !d.spellcheck, JSON.stringify(d).slice(0, 200))
  const flags = await main.eval(`(() => { const { session, webContents } = process.mainModule.require('electron'); const w = webContents.getAllWebContents().find((x) => x.getURL().startsWith('f2px://home')); return JSON.stringify({ spell: session.fromPartition('persist:f2px').isSpellCheckerEnabled(), webrtc: w && w.getWebRTCIPHandlingPolicy() }) })()`)
  const f = JSON.parse(flags)
  check('spell check (Google dictionary download) is disabled', f.spell === false, flags)
  check('WebRTC only exposes the public interface (no LAN IP leak)', f.webrtc === 'default_public_interface_only', flags)

  const imgState = async () => {
    const u = (await activeTab()).url
    const pc = await connect((await targets()).find((x) => x.type === 'page' && x.url === u))
    const r = await pc.eval(`JSON.stringify(Object.fromEntries([...document.images].map((i) => [i.id, i.complete && i.naturalWidth > 0])))`)
    pc.close()
    return JSON.parse(r)
  }
  const load = async (url) => {
    await rpc('nav.go', url)
    await waitFor(async () => { const t = await activeTab(); return t.url === url && !t.loading })
    await sleep(1200)
  }

  // ── tracker blocking
  await load('http://127.0.0.1:8899/trackers')
  let img = await imgState()
  check('standard: ad + analytics trackers are blocked', img.ads === false && img.analytics === false, JSON.stringify(img))
  check('standard: social widget and ordinary third-party resources still load', img.social === true && img.plain === true, JSON.stringify(img))
  check('blocked count is shown for the tab', await waitFor(async () => (await activeTab()).blocked === 2), String((await activeTab()).blocked))
  check('the shield indicator appears in the address bar', (await shell.eval(`document.querySelector('.omni__shield')?.textContent`)) === '2')

  await rpc('settings.update', { trackerBlocking: 'strict' })
  await load('http://127.0.0.1:8899/trackers')
  img = await imgState()
  check('strict: social widgets are blocked too', img.social === false && img.ads === false, JSON.stringify(img))

  await rpc('settings.update', { trackerBlocking: 'off' })
  await load('http://127.0.0.1:8899/trackers')
  img = await imgState()
  check('off: nothing is blocked', img.ads && img.analytics && img.social && img.plain, JSON.stringify(img))
  check('off: no shield indicator', (await activeTab()).blocked === 0)

  // first-party requests are never blocked (visiting a tracker's own site works)
  await rpc('settings.update', { trackerBlocking: 'standard', httpsOnly: false })
  await load('http://doubleclick.net:8899/trackers')
  img = await imgState()
  check('first-party requests to a tracker domain are not blocked', img.ads === true && img.analytics === false, JSON.stringify(img))

  // lifetime counter (read from an internal page, like the Settings page does)
  await rpc('ui.openPage', 'settings')
  const st = await waitFor(async () => (await targets()).find((x) => x.url.startsWith('f2px://settings')))
  const sc = await connect(st); conns.push(sc)
  await sleep(800)
  const stats = await sc.eval(`window.f2px.rpc('privacy.stats')`)
  check('lifetime blocked counter accumulates', stats.blockedTotal >= 6, JSON.stringify(stats))
  check('Settings shows the privacy summary', /trackers blocked so far/i.test(await sc.eval('document.body.innerText')))
  await sc.send('Page.enable')
  await sc.eval(`document.querySelector('#sec-privacy').scrollIntoView()`)
  await sleep(500)
  await sc.shot(path.join(TMP, 'privacy-settings.png'))

  // ── HTTPS-only
  await rpc('settings.update', { httpsOnly: true })
  await rpc('nav.go', 'http://example.test:8899/')
  const err = await waitFor(async () => { const t = await activeTab(); return t.url.startsWith('f2px://error') && /type=httpsonly/.test(t.url) ? t : null }, 20000)
  check('http:// site without HTTPS shows the HTTPS-only warning page', !!err, err?.url)
  check('address bar keeps the http:// address', err?.displayUrl === 'http://example.test:8899/', err?.displayUrl)
  const et = await waitFor(async () => (await targets()).find((x) => x.url.startsWith('f2px://error')))
  const ec = await connect(et); conns.push(ec)
  await sleep(600)
  await ec.send('Page.enable')
  await ec.eval(`document.querySelector('.errpage__toggle').click()`)
  await sleep(400)
  await ec.shot(path.join(TMP, 'httpsonly.png'))
  check('the page offers an explicit "continue over HTTP" choice', /over http \(unsafe\)/i.test(await ec.eval('document.body.innerText')))
  await ec.eval(`document.querySelector('.errpage__unsafe .btn').click()`)
  const cont = await waitFor(async () => { const t = await activeTab(); return t.url === 'http://example.test:8899/' && t.title === 'Local Test Page' && !t.loading ? t : null }, 15000)
  check('after the user agrees, the site loads over HTTP', !!cont, cont?.url)
  check('localhost / IP addresses are never upgraded', (await (async () => { await load('http://127.0.0.1:8899/'); return (await activeTab()).url })()) === 'http://127.0.0.1:8899/')

  // ── clear on exit (cookies + history + saved session)
  await rpc('settings.update', { clearCookiesOnExit: true, clearHistoryOnExit: true, startupBehavior: 'restore' })
  await load('http://127.0.0.1:8899/setcookie')
  await load('http://127.0.0.1:8899/private-marker?erase-me')
  await sleep(1500)
  shell.close(); main.close(); conns.forEach((c) => { try { c.close() } catch {} })
  await browserClose(PORT)
  await waitFor(async () => { try { await targets(); return false } catch { return true } }, 15000, 500)
  killAll()
  await sleep(1200)

  app = launch(userData, PORT, 9236, [rules])
  shell = await waitFor(async () => shellConn(), 25000, 500)
  const rpc2 = rpcOf(shell)
  await waitFor(async () => (await rpc2('shell.state')).tabs.length)
  const s2 = await rpc2('shell.state')
  check('clear-history-on-exit also clears the saved session', s2.tabs.length === 1 && s2.tabs[0].url.startsWith('f2px://home'), JSON.stringify(s2.tabs.map((t) => t.url)))
  await rpc2('ui.openPage', 'history')
  const ht = await waitFor(async () => (await targets()).find((x) => x.url.startsWith('f2px://history')))
  const hc = await connect(ht); conns.push(hc)
  await sleep(800)
  const hist = await hc.eval(`window.f2px.rpc('history.list', {})`)
  check('history was erased on exit', hist.length === 0, String(hist.length))
  await rpc2('nav.go', 'http://127.0.0.1:8899/headers')
  await waitFor(async () => { const s = await rpc2('shell.state'); const t = s.tabs.find((x) => x.id === s.activeId); return t.url.endsWith('/headers') && !t.loading })
  const s3 = await rpc2('shell.state')
  const cur = s3.tabs.find((x) => x.id === s3.activeId).url
  const pc = await connect((await targets()).find((x) => x.type === 'page' && x.url === cur))
  const headers = JSON.parse(await pc.eval('document.body.innerText'))
  pc.close()
  check('cookies were erased on exit', !/f2px=1/.test(headers.cookie || ''), headers.cookie || '(none)')
} catch (e) {
  check('unexpected error', false, e.stack)
} finally {
  summary()
  try { shell?.close(); main?.close() } catch {}
  await browserClose(PORT).catch(() => {})
  server.close()
  killAll()
  process.exit(process.exitCode || 0)
}

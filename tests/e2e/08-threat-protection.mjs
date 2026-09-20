import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { launch, shellConn, waitFor, check, checkNet, summary, sleep, startServer, targets, connect, mainProcess, browserClose, killAll, TMP } from '../helpers/harness.mjs'

const PORT = 9358
const INSPECT = 9239
const userData = path.join(TMP, 'ud-e2e-threat')
fs.rmSync(userData, { recursive: true, force: true })
const server = await startServer()

// Update feed served locally (the browser talks to it only when update checks are enabled).
let feedHits = 0
let feedBody = { version: '9.9.9', url: 'https://example.com/get-f2px', notes: 'Test release' }
const feed = http.createServer((req, res) => {
  feedHits++
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(feedBody))
})
await new Promise((r) => feed.listen(8898, '127.0.0.1', r))

const MAP = ['malware.test', 'paypa1.com', 'paypal.com.evil.test', 'cdn.malware.test', 'fine.test']
const rules = `--host-resolver-rules=${MAP.map((h) => `MAP ${h} 127.0.0.1`).join(',')}`
const env = { F2PX_TEST_THREAT_HOSTS: 'malware.test', F2PX_UPDATE_FEED: 'http://127.0.0.1:8898/latest.json' }
launch(userData, PORT, INSPECT, [rules], env)
let shell, main
const conns = []
const rpcOf = (sh) => (m, ...a) => sh.eval(`window.f2pxShell.rpc(${JSON.stringify(m)}, ...${JSON.stringify(a)})`)
const click = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true })()`
const clickText = (sel, text) => `(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())})); if (!el) return false; el.click(); return true })()`

try {
  shell = await waitFor(async () => shellConn(), 30000, 500)
  main = await mainProcess(INSPECT)
  const rpc = rpcOf(shell)
  const state = () => rpc('shell.state')
  const activeTab = async () => { const s = await state(); return s.tabs.find((t) => t.id === s.activeId) }
  await waitFor(async () => (await state()).tabs.length)
  // page-scoped RPCs (threats.*, update.*, privacy.*) are only reachable from internal pages: keep the Home tab open for that
  const home0 = await waitFor(async () => (await targets()).find((x) => x.url.startsWith('f2px://home')))
  const hc0 = await connect(home0); conns.push(hc0)
  const prpc = (m, ...a) => hc0.eval(`window.f2px.rpc(${JSON.stringify(m)}, ...${JSON.stringify(a)})`)
  const firstTab = (await activeTab()).id
  await rpc('nav.go', 'http://127.0.0.1:8899/', { newTab: true })
  await waitFor(async () => (await activeTab()).id !== firstTab)
  const errorTab = async (kind, timeout = 20000) => waitFor(async () => { const t = await activeTab(); return t.url.startsWith('f2px://error') && t.url.includes(`type=${kind}`) ? t : null }, timeout)
  const errorPage = async () => {
    const t = await waitFor(async () => (await targets()).find((x) => x.url.startsWith('f2px://error')))
    const c = await connect(t); conns.push(c)
    await sleep(600)
    return c
  }
  const load = async (url) => {
    await rpc('nav.go', url)
    await waitFor(async () => { const t = await activeTab(); return t.url === url && !t.loading })
    await sleep(500)
  }

  const d = await rpc('settings.get')
  check('defaults: protection on, list updates and update checks off (no silent traffic)', d.threatProtection === true && d.protectionUpdates === false && d.checkUpdates === false, JSON.stringify({ t: d.threatProtection, p: d.protectionUpdates, u: d.checkUpdates }))
  const list = await prpc('threats.status')
  check('a bundled list of dangerous sites is loaded', list.entries > 50000 && list.source === 'bundled', JSON.stringify(list))

  // ── known-bad site (HTTPS-only is on: the threat page must win over the HTTPS upgrade)
  await rpc('nav.go', 'http://malware.test:8899/')
  let t = await errorTab('threat')
  check('a listed host shows the threat page (not the HTTPS-only page, nothing loaded)', !!t, (await activeTab()).url)
  check('the address bar keeps the address the user typed', t?.displayUrl === 'http://malware.test:8899/', t?.displayUrl)
  let ec = await errorPage()
  await ec.send('Page.enable')
  const text = await ec.eval('document.body.innerText')
  check('the page explains the danger and offers "Back to safety"', /Dangerous site blocked/i.test(text) && /known phishing and malware/i.test(text) && /Back to safety/i.test(text), text.slice(0, 200))
  check('the primary action does not reload the dangerous site', !(await ec.eval(`!![...document.querySelectorAll('.btn')].find(b => /retry|reload/i.test(b.textContent))`)))
  await ec.eval(click('.errpage__toggle'))
  await sleep(400)
  await ec.shot(path.join(TMP, 'threat-page.png'))
  check('"continue anyway" is hidden behind Advanced and clearly marked unsafe', /anyway \(unsafe\)/i.test(await ec.eval('document.body.innerText')))

  // ── sub-resources from a listed host are dropped on any page
  await load('http://127.0.0.1:8899/trackers')
  const statsBefore = (await prpc('privacy.stats')).blockedTotal
  const pc = await connect((await targets()).find((x) => x.type === 'page' && x.url === 'http://127.0.0.1:8899/trackers')); conns.push(pc)
  const loaded = await pc.eval(`new Promise((resolve) => { const i = new Image(); i.onload = () => resolve('loaded'); i.onerror = () => resolve('blocked'); i.src = 'http://cdn.malware.test:8899/pixel.gif?x=' + Date.now() })`)
  check('images from a dangerous host are blocked even on a harmless page', loaded === 'blocked', loaded)
  await sleep(400)
  check('...and counted in the shield statistics', (await prpc('privacy.stats')).blockedTotal > statsBefore)

  // ── "Back to safety"
  await rpc('nav.go', 'f2px://home')
  await waitFor(async () => (await activeTab()).url.startsWith('f2px://home'))
  await rpc('nav.go', 'http://malware.test:8899/')
  await errorTab('threat')
  ec = await errorPage()
  await ec.eval(clickText('.btn', 'Back to safety'))
  const safe = await waitFor(async () => { const x = await activeTab(); return x.url.startsWith('f2px://home') ? x : null }, 10000)
  check('"Back to safety" leaves the dangerous site', !!safe, (await activeTab()).url)

  // ── continue anyway
  await rpc('settings.update', { httpsOnly: false })
  await rpc('nav.go', 'http://malware.test:8899/')
  await errorTab('threat')
  ec = await errorPage()
  await ec.eval(click('.errpage__toggle'))
  await sleep(300)
  await ec.eval(click('.errpage__unsafe .btn'))
  const cont = await waitFor(async () => { const x = await activeTab(); return x.url === 'http://malware.test:8899/' && x.title === 'Local Test Page' && !x.loading ? x : null }, 15000)
  check('after the user insists, the site opens', !!cont, (await activeTab()).url)
  await load('http://malware.test:8899/?again')
  check('the choice is remembered for the session (no second warning)', (await activeTab()).title === 'Local Test Page')

  // ── switching protection off
  await rpc('settings.update', { threatProtection: false })
  await rpc('nav.go', 'http://paypal.com.evil.test:8899/')
  const off = await waitFor(async () => { const x = await activeTab(); return x.title === 'Local Test Page' && x.url.includes('evil.test') && !x.loading ? x : null }, 15000)
  check('with protection off nothing is blocked', !!off, (await activeTab()).url)
  await rpc('settings.update', { threatProtection: true })

  // ── look-alike addresses (paypal.com.evil.test was just visited, so it is exempt; use a new name)
  await rpc('nav.go', 'http://paypa1.com:8899/')
  t = await errorTab('threat')
  check('paypa1.com is flagged as imitating paypal.com', !!t && /detail=lookalike(%3A|:)paypal\.com/.test(t.url), t?.url)
  ec = await errorPage()
  await ec.send('Page.enable')
  const lt = await ec.eval('document.body.innerText')
  check('the look-alike page names the imitated brand', /Suspicious address/i.test(lt) && /paypal\.com/i.test(lt), lt.slice(0, 160))
  await ec.shot(path.join(TMP, 'lookalike-page.png'))
  await ec.eval(click('.errpage__toggle'))
  await sleep(300)
  await ec.eval(click('.errpage__unsafe .btn'))
  const known = await waitFor(async () => { const x = await activeTab(); return x.url.includes('paypa1.com') && x.title === 'Local Test Page' && !x.loading ? x : null }, 15000)
  check('"continue anyway" works for look-alike addresses too', !!known, (await activeTab()).url)
  await rpc('nav.go', 'http://paypa1.com:8899/?second')
  const second = await waitFor(async () => { const x = await activeTab(); return x.url.includes('second') && x.title === 'Local Test Page' && !x.loading ? x : null }, 15000)
  check('a host you have opened is not warned about again', !!second, (await activeTab()).url)
  await load('http://fine.test:8899/')
  check('ordinary hosts are never flagged', (await activeTab()).title === 'Local Test Page')

  // ── downloads: Mark-of-the-Web
  await load('http://127.0.0.1:8899/')
  await rpc('nav.go', 'http://127.0.0.1:8899/small.bin')
  const dl = await waitFor(async () => { const l = await rpc('downloads.list'); return l.find((x) => /^f2px-small( \(\d+\))?\.bin$/.test(x.filename) && x.state === 'completed') }, 20000)
  const zone = (await waitFor(async () => { try { return fs.readFileSync(`${dl?.savePath}:Zone.Identifier`, 'utf8') } catch { return null } }, 6000, 300)) || ''
  check('a downloaded file is tagged as coming from the Internet (Zone.Identifier)', /ZoneId=3/.test(zone), zone.replace(/\r?\n/g, ' | '))

  // ── update notification
  await sleep(500)
  const idle = await prpc('update.status')
  check('with update checks off the feed is never contacted', feedHits === 0 && idle.state === 'idle', JSON.stringify({ hits: feedHits, idle }))
  const res = await prpc('update.check')
  check('"Check now" finds a newer version and offers its https page', res.state === 'available' && res.latest === '9.9.9' && res.url === 'https://example.com/get-f2px', JSON.stringify(res))
  feedBody = { version: '0.0.1', url: 'https://example.com/old' }
  check('an older feed version means "up to date"', (await prpc('update.check')).state === 'uptodate')
  feedBody = { version: '9.9.9', url: 'javascript:alert(1)' }
  const bad = await prpc('update.check')
  check('a non-https download link from the feed is ignored', bad.state === 'available' && !bad.url, JSON.stringify(bad))
  feedBody = { version: '9.9.9', url: 'https://example.com/get-f2px', notes: 'Test release' }
  await prpc('update.check')

  // UI: Home notice + Settings section
  await rpc('nav.go', 'f2px://home')
  await waitFor(async () => (await activeTab()).url.startsWith('f2px://home'))
  await sleep(1500)
  let notice = ''
  for (const tg of (await targets()).filter((x) => x.url.startsWith('f2px://home'))) {
    const hc = await connect(tg); conns.push(hc)
    notice = (await hc.eval(`document.querySelector('.home__update')?.textContent || ''`)) || notice
  }
  check('the Home page shows "Update / v9.9.9 available"', /v9\.9\.9/.test(notice || ''), notice)

  await rpc('ui.openPage', 'settings')
  const st = await waitFor(async () => (await targets()).find((x) => x.url.startsWith('f2px://settings')))
  const sc = await connect(st); conns.push(sc)
  await sleep(1000)
  await sc.send('Page.enable')
  const body = await sc.eval('document.body.innerText')
  check('Settings: phishing/malware protection, list update and update-check controls exist', /Malware & phishing protection/i.test(body) && /Update the protection list/i.test(body) && /Check for F2PX updates/i.test(body) && /Version 9\.9\.9 is available/i.test(body))
  check('Settings shows the number of protected sites and its source', /\d[\d,]{4,} SITES · BUNDLED/.test(body), (body.match(/[\d,]+ SITES[^\n]*/) || [''])[0])
  await sc.eval(`document.querySelector('#sec-privacy').scrollIntoView()`)
  await sleep(500)
  await sc.shot(path.join(TMP, 'threat-settings.png'))
  check('the protection switch reflects the setting', (await sc.eval(`document.querySelector('[aria-label="Malware and phishing protection"]').getAttribute('aria-checked')`)) === 'true')
  await sc.eval(click('[aria-label="Check for updates"]'))
  await waitFor(async () => (await rpc('settings.get')).checkUpdates === true)
  check('the update-check switch works', (await rpc('settings.get')).checkUpdates === true)

  // ── refreshing the protection list from the open sources
  checkNet('"Update now" downloads fresh lists and reports the entry count', await (async () => {
    try {
      const s = await prpc('threats.update')
      return s.source === 'updated' && s.entries > 50000 && !!s.updatedAt
    } catch (e) { console.log('   ', String(e).slice(0, 160)); return false }
  })())
  checkNet('the refreshed list is stored on disk', fs.readdirSync(userData).includes('threats.bin'), fs.readdirSync(userData).join(','))
} finally {
  conns.forEach((c) => { try { c.close() } catch {} })
  try { shell?.close(); main?.close() } catch {}
  await browserClose(PORT).catch(() => {})
  await sleep(800)
  killAll()
  server.close()
  feed.close()
}
summary()

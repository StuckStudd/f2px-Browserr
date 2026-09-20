// Privacy shield: filter lists, element hiding, fingerprint protection (incl. iframes), cookies, referrer, exceptions.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { launch, shellConn, waitFor, check, summary, sleep, targets, connect, browserClose, killAll, mainProcess, TMP } from '../helpers/harness.mjs'

const PORT = 9363
const INSPECT = 9246
const userData = path.join(TMP, 'ud-e2e-shield')
fs.rmSync(userData, { recursive: true, force: true })

// ── a local web with several "sites" (all hosts are mapped to 127.0.0.1)
const requests = []
const FP_SCRIPT = `
function h(s){let x=0;for(let i=0;i<s.length;i++){x=(Math.imul(31,x)+s.charCodeAt(i))|0}return String(x)}
function fp(){
  const out={}
  const c=document.createElement('canvas');c.width=220;c.height=60
  const x=c.getContext('2d');x.textBaseline='top';x.font='16px Arial';x.fillStyle='#f60';x.fillRect(10,5,100,30)
  x.fillStyle='#069';x.fillText('F2PX fingerprint test 123',4,10);x.fillStyle='rgba(102,204,0,0.7)';x.fillText('F2PX fingerprint test 123',6,12)
  out.canvas=h(c.toDataURL())
  out.canvas2=h(c.toDataURL())
  out.imageData=h(Array.from(x.getImageData(0,0,220,60).data).join(','))
  try{const g=document.createElement('canvas').getContext('webgl');const e=g.getExtension('WEBGL_debug_renderer_info');out.renderer=g.getParameter(e.UNMASKED_RENDERER_WEBGL);out.vendor=g.getParameter(e.UNMASKED_VENDOR_WEBGL)}catch(e){out.renderer=null}
  out.cores=navigator.hardwareConcurrency
  out.memory=navigator.deviceMemory
  out.screen=[screen.width,screen.height,screen.availWidth,screen.colorDepth,window.outerWidth===window.innerWidth]
  out.tz=Intl.DateTimeFormat().resolvedOptions().timeZone
  out.tzOffset=new Date(2026,6,1).getTimezoneOffset()
  out.langs=navigator.languages.join(',')
  out.battery=typeof navigator.getBattery
  out.toStringOk=/\\[native code\\]/.test(HTMLCanvasElement.prototype.toDataURL.toString())&&HTMLCanvasElement.prototype.toDataURL.name==='toDataURL'
  out.referrer=document.referrer
  return out
}
window.__fp=fp()
`
const server = http.createServer((req, res) => {
  const host = (req.headers.host || '').split(':')[0]
  requests.push({ host, url: req.url, headers: req.headers })
  const route = req.url.split('?')[0]
  const html = (body, headers = {}) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...headers })
    res.end(body)
  }
  if (route === '/pixel.gif' || route === '/assets/logo.gif') {
    res.writeHead(200, { 'Content-Type': 'image/gif' })
    return res.end(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'))
  }
  if (route === '/assets/badge.gif') {
    // Third-party cookies need SameSite=None + Secure, which Chromium only accepts over https or on localhost.
    const cookie = host === 'localhost' ? 'tp=1; Max-Age=3600; Path=/; SameSite=None; Secure' : 'tp=1; Max-Age=3600; Path=/'
    res.writeHead(200, { 'Content-Type': 'image/gif', 'Set-Cookie': cookie })
    return res.end(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'))
  }
  if (route === '/ads') {
    return html(`<!doctype html><title>Ads</title>
      <img id=adzerk src="http://adzerk.net:${server.port}/pixel.gif?1">
      <img id=exo src="http://exoclick.com:${server.port}/pixel.gif?2">
      <img id=ok src="http://cdn.example.test:${server.port}/assets/logo.gif?3">
      <div id="ad-banner-1" style="height:20px;background:red">ad</div><div id="content" style="height:20px">content</div>`)
  }
  if (route === '/localnet') {
    return html(`<!doctype html><title>Local</title><img id=lan src="http://localhost:${server.port}/assets/logo.gif?lan"><img id=own src="http://${host}:${server.port}/assets/logo.gif?own">`)
  }
  if (route === '/fp') return html(`<!doctype html><title>FP</title><script>${FP_SCRIPT}</script>`)
  if (route === '/frames') {
    return html(`<!doctype html><title>Frames</title><script>${FP_SCRIPT}</script>
      <iframe id=cross src="http://site-b.test:${server.port}/fp-frame"></iframe>
      <script>
        const f=document.createElement('iframe');document.body.appendChild(f)
        // classic bypass: take the unpatched function from a fresh blank frame
        const c=document.createElement('canvas');c.width=220;c.height=60
        const x=c.getContext('2d');x.font='16px Arial';x.fillStyle='#069';x.fillText('F2PX fingerprint test 123',4,10)
        const viaFrame=f.contentWindow.HTMLCanvasElement.prototype.toDataURL.call(c)
        const viaPage=c.toDataURL()
        window.__bypass={same:viaFrame===viaPage,cores:f.contentWindow.navigator.hardwareConcurrency,coresPage:navigator.hardwareConcurrency}
      </script>`)
  }
  if (route === '/fp-frame') return html(`<!doctype html><title>FPF</title><script>${FP_SCRIPT}</script>`)
  if (route === '/cookies') {
    return html(`<!doctype html><title>Cookies</title><img src="http://localhost:${server.port}/assets/badge.gif"><img src="http://${host}:${server.port}/assets/badge.gif?first">`)
  }
  if (route === '/cross-referrer') {
    return html(`<!doctype html><title>Ref</title><img src="http://site-b.test:${server.port}/assets/logo.gif?ref"><img src="http://${host}:${server.port}/assets/logo.gif?sameref">`)
  }
  if (route === '/') return html('<!doctype html><title>Home</title>hello')
  res.writeHead(404)
  res.end('nope')
})
await new Promise((r) => server.listen(8899, '127.0.0.1', r))
server.port = 8899

const MAP = ['adzerk.net', 'exoclick.com', 'cdn.example.test', 'site-a.test', 'site-b.test']
const rules = `--host-resolver-rules=${MAP.map((h) => `MAP ${h} 127.0.0.1`).join(',')}`
const app = launch(userData, PORT, INSPECT, [rules])
let shell, main
const rpcOf = (sh) => (m, ...a) => sh.eval(`window.f2pxShell.rpc(${JSON.stringify(m)}, ...${JSON.stringify(a)})`)

try {
  shell = await waitFor(async () => shellConn(), 25000, 500)
  main = await mainProcess(INSPECT)
  const rpc = rpcOf(shell)
  const state = () => rpc('shell.state')
  const activeTab = async () => { const s = await state(); return s.tabs.find((t) => t.id === s.activeId) }
  await waitFor(async () => (await state()).tabs.length)
  await rpc('settings.update', { httpsOnly: false })

  const load = async (url, newTab = false) => {
    await rpc(newTab ? 'tabs.create' : 'nav.go', ...(newTab ? [{ url }] : [url]))
    await waitFor(async () => { const t = await activeTab(); return t.url === url && !t.loading }, 20000)
    await sleep(900)
  }
  const pageConn = async (urlPrefix) => {
    const t = await waitFor(async () => (await targets()).find((x) => x.type === 'page' && x.url.startsWith(urlPrefix)), 10000)
    return connect(t)
  }
  const evalPage = async (url, expr) => {
    const pc = await pageConn(url)
    try { return await pc.eval(expr) } catch (e) { throw new Error(`${url}: ${e.message}`) } finally { pc.close() }
  }

  // ── lists are loaded
  const filters = await waitFor(async () => { const f = await main.eval(`JSON.stringify(process.mainModule.require('electron').session.defaultSession && 1)`); return f }, 3000)
  const app2 = await shell.eval(`window.f2pxShell.rpc('settings.get')`)
  check('defaults: filter lists, cosmetic filtering and standard fingerprint protection are on', app2.adBlocking && app2.cosmeticFiltering && app2.fingerprintProtection === 'standard' && !app2.blockThirdPartyCookies)

  // ── filter lists (network)
  await load('http://site-a.test:8899/ads')
  let imgs = JSON.parse(await evalPage('http://site-a.test:8899/ads', `JSON.stringify(Object.fromEntries([...document.images].map((i) => [i.id, i.complete && i.naturalWidth > 0])))`))
  check('filter lists: hosts from EasyList are blocked (not in the built-in list)', imgs.adzerk === false && imgs.exo === false, JSON.stringify(imgs))
  check('filter lists: ordinary third-party images still load', imgs.ok === true, JSON.stringify(imgs))
  check('filter lists: blocked requests never reach the server', !requests.some((r) => r.host === 'adzerk.net'))
  check('the tab reports the blocked count', await waitFor(async () => (await activeTab()).blocked >= 2))

  // ── element hiding
  const hidden = await evalPage('http://site-a.test:8899/ads', `JSON.stringify({ ad: getComputedStyle(document.getElementById('ad-banner-1')).display, content: getComputedStyle(document.getElementById('content')).display })`)
  check('element hiding: the ad placeholder is hidden, content stays', JSON.parse(hidden).ad === 'none' && JSON.parse(hidden).content === 'block', hidden)

  // ── per-site exception
  const info = await rpc('site.info')
  check('site info describes the active site', info?.site === 'site-a.test' && info.shieldsUp === true && info.report.ads + info.report.trackers >= 2, JSON.stringify(info))
  await rpc('site.setShields', false)
  await sleep(1500)
  imgs = JSON.parse(await evalPage('http://site-a.test:8899/ads', `JSON.stringify(Object.fromEntries([...document.images].map((i) => [i.id, i.complete && i.naturalWidth > 0])))`))
  check('shields off for a site: its ads load again', imgs.adzerk === true && imgs.exo === true, JSON.stringify(imgs))
  const hidden2 = await evalPage('http://site-a.test:8899/ads', `getComputedStyle(document.getElementById('ad-banner-1')).display`)
  check('shields off for a site: nothing is hidden', hidden2 === 'block', hidden2)
  await rpc('site.setShields', true)
  await sleep(1500)
  imgs = JSON.parse(await evalPage('http://site-a.test:8899/ads', `JSON.stringify(Object.fromEntries([...document.images].map((i) => [i.id, i.complete && i.naturalWidth > 0])))`))
  check('shields back on: blocked again', imgs.adzerk === false, JSON.stringify(imgs))

  await rpc('settings.update', { adBlocking: false })
  await load('http://site-a.test:8899/ads?off')
  imgs = JSON.parse(await evalPage('http://site-a.test:8899/ads?off', `JSON.stringify(Object.fromEntries([...document.images].map((i) => [i.id, i.complete && i.naturalWidth > 0])))`))
  check('ad blocking switch off: filter-list hosts load', imgs.adzerk === true, JSON.stringify(imgs))
  await rpc('settings.update', { adBlocking: true })

  // ── requests from a public site to your own machine (strict tracking protection)
  const lanImgs = (url) => evalPage(url, `JSON.stringify(Object.fromEntries([...document.images].map((i) => [i.id, i.complete && i.naturalWidth > 0])))`).then(JSON.parse)
  await load('http://site-a.test:8899/localnet?standard')
  let lan = await lanImgs('http://site-a.test:8899/localnet?standard')
  check('local network: a public page may reach localhost by default (standard)', lan.lan === true && lan.own === true, JSON.stringify(lan))
  await rpc('settings.update', { trackerBlocking: 'strict' })
  await load('http://site-a.test:8899/localnet?strict')
  lan = await lanImgs('http://site-a.test:8899/localnet?strict')
  check('local network: strict blocks a public site reaching into your machine, own images still load', lan.lan === false && lan.own === true, JSON.stringify(lan))
  await rpc('settings.update', { trackerBlocking: 'standard' })

  // ── fingerprinting (standard)
  const fpUrl = (host) => `http://${host}:8899/fp`
  await rpc('settings.update', { fingerprintProtection: 'off' })
  await load(fpUrl('site-a.test'))
  const off = await evalPage(fpUrl('site-a.test'), 'JSON.stringify(window.__fp)').then(JSON.parse)
  await rpc('settings.update', { fingerprintProtection: 'standard' })
  await load(fpUrl('site-a.test') + '?1')
  const a1 = await evalPage(fpUrl('site-a.test') + '?1', 'JSON.stringify(window.__fp)').then(JSON.parse)
  await load(fpUrl('site-a.test') + '?2')
  const a2 = await evalPage(fpUrl('site-a.test') + '?2', 'JSON.stringify(window.__fp)').then(JSON.parse)
  await load(fpUrl('site-b.test'))
  const b = await evalPage(fpUrl('site-b.test'), 'JSON.stringify(window.__fp)').then(JSON.parse)
  check('fingerprint: canvas readback is changed by the shield', a1.canvas !== off.canvas, `${off.canvas} vs ${a1.canvas}`)
  check('fingerprint: the same site sees the same canvas every time (nothing breaks)', a1.canvas === a2.canvas && a1.canvas === a1.canvas2 && a1.imageData === a2.imageData)
  check('fingerprint: another site sees a different canvas (no cross-site identifier)', a1.canvas !== b.canvas && a1.imageData !== b.imageData, `${a1.canvas} vs ${b.canvas}`)
  check('fingerprint: patched functions still look native', a1.toStringOk === true)
  if (off.renderer) check('fingerprint: the GPU model is not exposed (standard)', a1.renderer !== off.renderer && /ANGLE/.test(a1.renderer), `${off.renderer} -> ${a1.renderer}`)
  check('fingerprint: core count is bucketed', [2, 4, 8].includes(a1.cores), String(a1.cores))
  const attempts = await waitFor(async () => (await activeTab()).fingerprint >= 1 ? (await activeTab()).fingerprint : 0, 5000)
  check('the tab counts neutralised fingerprinting attempts', attempts >= 1, String(attempts))

  // blank-iframe bypass and cross-site iframes
  await load('http://site-a.test:8899/frames')
  const frames = await evalPage('http://site-a.test:8899/frames', 'JSON.stringify({ bypass: window.__bypass, cross: document.getElementById("cross") && 1 })').then(JSON.parse)
  check('fingerprint: a blank iframe cannot be used to reach the unpatched canvas', frames.bypass?.same === true, JSON.stringify(frames.bypass))
  const crossTarget = await waitFor(async () => (await targets()).find((x) => x.type === 'iframe' && x.url.includes('site-b.test')), 8000)
  if (crossTarget) {
    const cc = await connect(crossTarget)
    const cross = JSON.parse(await cc.eval('JSON.stringify(window.__fp)'))
    cc.close()
    check('fingerprint: cross-site iframes are protected too (own seed per top-level site)', cross.canvas !== undefined && cross.canvas !== off.canvas && cross.toStringOk === true, JSON.stringify(cross).slice(0, 160))
  } else check('cross-site iframe was found as a separate target', false)

  // ── strict
  await rpc('settings.update', { fingerprintProtection: 'strict' })
  await load(fpUrl('site-a.test') + '?strict', true)
  const s1 = await evalPage(fpUrl('site-a.test') + '?strict', 'JSON.stringify(window.__fp)').then(JSON.parse)
  check('strict: hardware is reported the same for everybody', s1.cores === 4 && (s1.memory === 8 || s1.memory === undefined), `${s1.cores}/${s1.memory}`)
  check('strict: screen size follows the window, not the display', s1.screen[4] === true && s1.screen[3] === 24, JSON.stringify(s1.screen))
  check('strict: time zone is UTC and language en-US', s1.tz === 'UTC' && s1.tzOffset === 0 && s1.langs.startsWith('en-US'), `${s1.tz} ${s1.tzOffset} ${s1.langs}`)
  check('strict: battery API is gone', s1.battery === 'undefined', s1.battery)
  if (off.renderer) check('strict: the GPU is reported as a generic one', /SwiftShader/.test(s1.renderer), s1.renderer)
  await load('http://site-a.test:8899/frames', false)
  const sf = await evalPage('http://site-a.test:8899/frames', 'JSON.stringify(window.__bypass)').then(JSON.parse)
  check('strict: blank iframes see the same hardware values', sf.cores === 4 && sf.coresPage === 4, JSON.stringify(sf))

  // ── third-party cookies
  const cookieNames = async () => main.eval(`process.mainModule.require('electron').session.fromPartition('persist:f2px').cookies.get({}).then((c) => JSON.stringify(c.map((k) => k.name + '@' + k.domain)))`).then(JSON.parse)
  await main.eval(`process.mainModule.require('electron').session.fromPartition('persist:f2px').clearStorageData()`)
  await rpc('settings.update', { blockThirdPartyCookies: false })
  await load('http://site-a.test:8899/cookies')
  let jar = await cookieNames()
  check('cookies: third-party cookies are stored when allowed', jar.some((c) => c.startsWith('tp@localhost')), JSON.stringify(jar))
  await main.eval(`process.mainModule.require('electron').session.fromPartition('persist:f2px').clearStorageData()`)
  await rpc('settings.update', { blockThirdPartyCookies: true })
  await load('http://site-a.test:8899/cookies?blocked')
  jar = await cookieNames()
  check('cookies: third-party Set-Cookie is dropped when blocking', !jar.some((c) => c.endsWith('@localhost')), JSON.stringify(jar))
  check('cookies: first-party cookies still work', jar.some((c) => c.startsWith('tp@site-a.test')), JSON.stringify(jar) + ' reqs=' + JSON.stringify(requests.filter((r) => r.url.includes('cookie.gif')).map((r) => r.host + r.url)))
  const sent = requests.filter((r) => r.host === 'localhost' && r.url.startsWith('/assets/badge.gif') && r.headers.cookie)
  check('cookies: nothing is sent back to the third party', sent.length === 0, JSON.stringify(sent.map((r) => r.headers.cookie)))
  await rpc('site.setCookies', true)
  await sleep(1500)
  jar = await cookieNames()
  check('cookies: a per-site exception allows them again', jar.some((c) => c.startsWith('tp@localhost')), JSON.stringify(jar))
  await rpc('site.setCookies', false)

  // ── "clear this site's data" removes that site's cookies only
  await main.eval(`process.mainModule.require('electron').session.fromPartition('persist:f2px').clearStorageData()`)
  await load('http://site-a.test:8899/cookies?seed')
  await load('http://localhost:8899/assets/badge.gif?other-site')
  jar = await cookieNames()
  check('site data: both sites have cookies before clearing', jar.some((c) => c.startsWith('tp@site-a.test')) && jar.some((c) => c.startsWith('tp@localhost')), JSON.stringify(jar))
  await load('http://site-a.test:8899/')
  await rpc('site.clearData')
  await sleep(1500)
  jar = await cookieNames()
  check('site data: "Clear site data" removes the active site’s cookies and leaves other sites alone', !jar.some((c) => c.endsWith('@site-a.test')) && jar.some((c) => c.startsWith('tp@localhost')), JSON.stringify(jar))

  // ── referrer
  requests.length = 0
  await rpc('settings.update', { stripCrossSiteReferrer: false })
  await load('http://site-a.test:8899/cross-referrer?default')
  const withRef = requests.find((r) => r.host === 'site-b.test' && r.url.includes('ref'))
  check('referrer: by default the origin is sent cross-site (Chromium behaviour)', !!withRef?.headers.referer, JSON.stringify(withRef?.headers.referer))
  requests.length = 0
  await rpc('settings.update', { stripCrossSiteReferrer: true })
  await load('http://site-a.test:8899/cross-referrer?strip')
  const crossReq = requests.find((r) => r.host === 'site-b.test' && r.url.includes('ref'))
  const sameReq = requests.find((r) => r.host === 'site-a.test' && r.url.includes('sameref'))
  check('referrer: stripped on cross-site requests', crossReq && !crossReq.headers.referer, JSON.stringify(crossReq?.headers.referer))
  check('referrer: kept on same-site requests', !!sameReq?.headers.referer, JSON.stringify(sameReq?.headers.referer))

  // ── Fire generates a new fingerprint identity and clears data
  await rpc('settings.update', { fingerprintProtection: 'standard' })
  await load(fpUrl('site-a.test') + '?before')
  const before = await evalPage(fpUrl('site-a.test') + '?before', 'JSON.stringify(window.__fp)').then(JSON.parse)
  // The window that issued Fire is closed by it, so its own connection never gets an answer: fire and reconnect.
  void rpc('privacy.fire', { tabs: true, history: true, downloads: true, cookies: true, cache: true, permissions: true }).catch(() => undefined)
  await sleep(2500)
  shell.close?.()
  shell = await waitFor(async () => shellConn(), 15000, 400)
  const rpc2 = rpcOf(shell)
  const stateAfter = await rpc2('shell.state')
  check('fire: all tabs are closed and one fresh start page remains', stateAfter.tabs.length === 1 && stateAfter.tabs[0].url === 'f2px://home/', JSON.stringify(stateAfter.tabs.map((t) => t.url)))
  jar = await cookieNames()
  check('fire: cookies are gone', jar.length === 0, JSON.stringify(jar))
  await rpc2('nav.go', fpUrl('site-a.test') + '?after')
  await sleep(2500)
  const after = await evalPage(fpUrl('site-a.test') + '?after', 'JSON.stringify(window.__fp)').then(JSON.parse)
  check('fire: sites get a new fingerprint identity', before.canvas !== after.canvas, `${before.canvas} vs ${after.canvas}`)
} catch (error) {
  check('e2e run completed without an exception', false, error?.stack || String(error))
} finally {
  summary()
  try { main?.close() } catch {}
  try { await browserClose(PORT) } catch {}
  killAll()
  server.close()
  process.exit(process.exitCode ?? 0)
}

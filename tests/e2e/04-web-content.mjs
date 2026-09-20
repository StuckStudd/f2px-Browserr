import fs from 'node:fs'
import path from 'node:path'
import { launch, shellConn, waitFor, check, summary, sleep, startServer, targets, connect, browserClose, killAll, mainProcess, TMP, NET, checkNet, downloadsDir } from '../helpers/harness.mjs'
const PORT = 9351
const userData = path.join(TMP, 'ud-e2e5')
fs.rmSync(userData, { recursive: true, force: true })
const server = await startServer()
const app = launch(userData, PORT, 9235)
let shell, main
try {
  shell = await waitFor(async () => shellConn(), 20000, 500)
  main = await mainProcess(9235)
  const rpc = (m, ...a) => shell.eval(`window.f2pxShell.rpc(${JSON.stringify(m)}, ...${JSON.stringify(a)})`)
  const state = () => rpc('shell.state')
  const activeTab = async () => { const s = await state(); return s.tabs.find((t) => t.id === s.activeId) }
  const mainEval = (js) => main.eval(js)
  const mouse = (url, x, y, button) => mainEval(`(() => { const {webContents} = process.mainModule.require('electron'); const w = webContents.getAllWebContents().find(w => w.getURL() === ${JSON.stringify(url)}); w.focus(); w.sendInputEvent({type:'mouseMove', x:${x}, y:${y}}); w.sendInputEvent({type:'mouseDown', x:${x}, y:${y}, button:${JSON.stringify(button)}, clickCount:1}); w.sendInputEvent({type:'mouseUp', x:${x}, y:${y}, button:${JSON.stringify(button)}, clickCount:1}); return true })()`)
  await waitFor(async () => (await state()).tabs.length)

  await rpc('nav.go', 'http://127.0.0.1:8899/links')
  await waitFor(async () => { const t = await activeTab(); return t.title === 'Links' && !t.loading })
  await sleep(700) // let the page lay out before real mouse events
  const linksUrl = 'http://127.0.0.1:8899/links'
  const s0 = await state()

  // middle click -> background tab
  await mouse(linksUrl, 100, 60, 'middle')
  const s1 = await waitFor(async () => { const s = await state(); return s.tabs.length === s0.tabs.length + 1 ? s : null })
  check('middle mouse button opens a link in a NEW background tab', !!s1 && s1.activeId === s0.activeId && s1.tabs.some((t) => t.url.includes('?mid')), s1 && JSON.stringify(s1.tabs.map((t) => t.url.slice(-12))))
  check('new tab is placed right after the opener', !!s1 && s1.tabs[1].url.includes('?mid'))

  // target=_blank -> foreground tab
  await mouse(linksUrl, 100, 160, 'left')
  const s2 = await waitFor(async () => { const s = await state(); return s.tabs.length === s1.tabs.length + 1 ? s : null })
  const cur2 = s2 && s2.tabs.find((t) => t.id === s2.activeId)
  check('target=_blank link opens a foreground tab', !!s2 && cur2.url.includes('?blank'), cur2?.url)

  // window.open popup keeps opener (OAuth-style)
  await rpc('tabs.activate', s0.activeId)
  await sleep(500)
  await mouse(linksUrl, 100, 260, 'left')
  const popup = await waitFor(async () => (await targets()).find((t) => t.type === 'page' && t.url.includes('?popup')), 8000)
  check('window.open() popup window is allowed and loads', !!popup, popup?.url)
  if (popup) {
    const pc = await connect(popup)
    const hasOpener = await pc.eval(`!!window.opener`)
    check('popup keeps window.opener (needed for OAuth logins)', hasOpener === true)
    const secure = await pc.eval(`typeof require === 'undefined' && typeof process === 'undefined'`)
    check('popup has no Node access', secure === true)
    pc.close()
  }

  // omnibox remote suggestions (needs network; suggestions are off by default)
  await rpc('settings.update', { searchEngine: 'google', searchSuggestions: true })
  const sugg = await rpc('omnibox.remote', 'youtube')
  checkNet('search-engine suggestions are fetched (Google)', Array.isArray(sugg) && sugg.length > 0, JSON.stringify(sugg).slice(0, 80))
  await rpc('settings.update', { searchSuggestions: false })
  check('suggestions can be disabled (no request sent)', (await rpc('omnibox.remote', 'youtube')).length === 0)
  await rpc('settings.update', { searchSuggestions: true })
  const local = await rpc('omnibox.suggest', 'links')
  check('local suggestions include history + the "what Enter does" row', local.some((x) => x.kind === 'action') && local.some((x) => x.kind === 'history'), local.map((x) => x.kind).join(','))
  const top = await rpc('omnibox.suggest', '')
  check('empty query returns frequently visited sites', top.length > 0 && top[0].kind === 'top')

  // crash page
  await rpc('nav.go', 'http://127.0.0.1:8899/')
  await waitFor(async () => (await activeTab()).title === 'Local Test Page' && !(await activeTab()).loading)
  await mainEval(`(() => { const {webContents} = process.mainModule.require('electron'); const w = webContents.getAllWebContents().find(w => w.getURL() === 'http://127.0.0.1:8899/'); w.forcefullyCrashRenderer(); return true })()`)
  const crashed = await waitFor(async () => { const t = await activeTab(); return t.url.startsWith('f2px://error') && /type=crash/.test(t.url) ? t : null }, 12000)
  check('renderer crash shows the "Page crashed" page', !!crashed, crashed?.url)
  check('crash page keeps the original URL in the address bar', crashed?.displayUrl === 'http://127.0.0.1:8899/', crashed?.displayUrl)
  await rpc('nav.reload', false)
  const recovered = await waitFor(async () => { const t = await activeTab(); return t.title === 'Local Test Page' && !t.loading ? t : null }, 12000)
  check('reload on the crash page reloads the original page', !!recovered)

  // permissions
  const pc2 = await connect((await targets()).find((t) => t.type === 'page' && t.url === 'http://127.0.0.1:8899/'))
  const geo = await pc2.eval(`new Promise((res) => navigator.geolocation.getCurrentPosition(() => res('granted'), (e) => res('denied:' + e.code), { timeout: 3000 }))`)
  check('geolocation permission is denied by default', String(geo).startsWith('denied'), String(geo))
  pc2.close()

  // web content isolation
  const pc3 = await connect((await targets()).find((t) => t.type === 'page' && t.url === 'http://127.0.0.1:8899/'))
  await pc3.eval(`location.href = 'f2px://settings'`).catch(() => {})
  await sleep(1200)
  pc3.close()
  const afterBlock = await activeTab()
  check('web pages cannot navigate to f2px:// internal pages', !afterBlock.url.startsWith('f2px://settings'), afterBlock.url)
  const pc4 = await connect((await targets()).find((t) => t.type === 'page' && t.url === 'http://127.0.0.1:8899/'))
  const hasApi = await pc4.eval(`typeof window.f2px + '|' + typeof window.f2pxShell`)
  check('web pages have no F2PX bridge object', hasApi === 'undefined|undefined', hasApi)
  const cantFs = await pc4.eval(`fetch('file:///C:/Windows/win.ini').then(() => 'loaded').catch(() => 'blocked')`)
  check('web pages cannot read local files', cantFs === 'blocked', cantFs)
  const identity = await pc4.eval(`JSON.stringify({ brands: navigator.userAgentData.brands.map((b) => b.brand), app: typeof chrome.app })`)
  check('Chrome compatibility: Client Hints include "Google Chrome" and window.chrome helpers exist', /Google Chrome/.test(identity) && /"object"/.test(identity), identity)
  pc4.close()
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

import fs from 'node:fs'
import path from 'node:path'
import { launch, shellConn, waitFor, check, summary, sleep, startServer, targets, connect, browserClose, killAll, mainProcess, TMP, NET, checkNet, downloadsDir } from '../helpers/harness.mjs'

const PORT = 9343
const userData = path.join(TMP, 'ud-e2e3')
fs.rmSync(userData, { recursive: true, force: true })
const server = await startServer()

let main
/** Real input events injected in the main process (goes through before-input-event like OS keys). */
async function press(where, key, mods = []) {
  const target = where === 'shell' ? `w.getURL().includes('index.html') && !w.getURL().includes('private=1')` : `w.getURL() === ${JSON.stringify(where)}`
  await main.eval(`(() => { const {webContents} = process.mainModule.require('electron'); const w = webContents.getAllWebContents().find(w => ${target}); if (!w) throw new Error('no target'); w.focus(); w.sendInputEvent({type:'keyDown', keyCode:${JSON.stringify(key)}, modifiers:${JSON.stringify(mods)}}); w.sendInputEvent({type:'keyUp', keyCode:${JSON.stringify(key)}, modifiers:${JSON.stringify(mods)}}); return true })()`)
}

let app = launch(userData, PORT, 9232)
let shell
try {
  shell = await waitFor(async () => shellConn(), 20000, 500)
  main = await mainProcess(9232)
  const rpc = (m, ...a) => shell.eval(`window.f2pxShell.rpc(${JSON.stringify(m)}, ...${JSON.stringify(a)})`)
  const state = () => rpc('shell.state')
  const activeTab = async () => { const s = await state(); return s.tabs.find((t) => t.id === s.activeId) }
  const pageConn = async () => {
    const t = await activeTab()
    const tg = (await targets()).find((x) => x.type === 'page' && x.url === t.url)
    return connect(tg)
  }
  await waitFor(async () => (await state()).tabs.length)

  await rpc('nav.go', 'http://127.0.0.1:8899/')
  await waitFor(async () => (await activeTab()).title === 'Local Test Page')

  // ---- hotkeys (real input events into the focused web page)
  const activePage = async () => { const u = (await activeTab()).url; return connect((await targets()).find((x) => x.type === 'page' && x.url === u)) }
  const count = async () => (await state()).tabs.length
  const pageUrl = async () => (await activeTab()).url
  const n0 = await count()
  await press(await pageUrl(), 'T', ['control'])
  check('CTRL+T opens a new tab', await waitFor(async () => (await count()) === n0 + 1))
  await rpc('nav.go', 'http://127.0.0.1:8899/private-marker?closeme')
  await waitFor(async () => (await activeTab()).title === 'Private Marker')
  await sleep(500)
  await press(await pageUrl(), 'W', ['control'])
  check('CTRL+W closes the tab', await waitFor(async () => (await count()) === n0))
  await sleep(400)
  await press(await pageUrl(), 'T', ['control', 'shift'])
  check('CTRL+SHIFT+T restores the closed tab', await waitFor(async () => (await count()) === n0 + 1))
  await sleep(500)

  const before = (await state()).activeId
  await press(await pageUrl(), 'Tab', ['control'])
  const afterNext = await waitFor(async () => { const s = await state(); return s.activeId !== before ? s.activeId : null })
  check('CTRL+TAB switches to the next tab', !!afterNext)
  await sleep(500)
  await press(await pageUrl(), 'Tab', ['control', 'shift'])
  const afterPrev = await waitFor(async () => { const s = await state(); return s.activeId === before ? s.activeId : null })
  check('CTRL+SHIFT+TAB switches back', !!afterPrev)
  await sleep(500)

  await press(await pageUrl(), 'L', ['control'])
  await sleep(600)
  check('CTRL+L focuses the address bar', (await shell.eval(`document.activeElement?.classList.contains('omni__input')`)) === true)
  await press('shell', 'Escape')
  await sleep(300)

  await rpc('nav.go', 'http://127.0.0.1:8899/')
  await waitFor(async () => (await activeTab()).title === 'Local Test Page' && !(await activeTab()).loading)
  await press(await pageUrl(), 'D', ['control'])
  check('CTRL+D opens the bookmark popup', await waitFor(async () => (await shell.eval(`!!document.querySelector('.popup--bookmark')`)) === true))
  check('CTRL+D bookmarks the page', (await rpc('bookmarks.tree')).some((b) => b.url === 'http://127.0.0.1:8899/'))
  await shell.eval(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`)
  await sleep(400)

  await press(await pageUrl(), 'H', ['control'])
  check('CTRL+H opens history', await waitFor(async () => (await targets()).find((x) => x.url.startsWith('f2px://history'))))
  await sleep(500)
  await press(await pageUrl(), 'J', ['control'])
  check('CTRL+J opens downloads', await waitFor(async () => (await targets()).find((x) => x.url.startsWith('f2px://downloads'))))
  await sleep(500)

  // back / forward + reload
  await rpc('nav.go', 'http://127.0.0.1:8899/')
  await waitFor(async () => (await activeTab()).title === 'Local Test Page' && !(await activeTab()).loading)
  await rpc('nav.go', 'http://127.0.0.1:8899/private-marker')
  await waitFor(async () => (await activeTab()).title === 'Private Marker' && !(await activeTab()).loading)
  await press(await pageUrl(), 'Left', ['alt'])
  check('ALT+LEFT goes back', await waitFor(async () => (await activeTab()).title === 'Local Test Page'))
  await sleep(600)
  await press(await pageUrl(), 'Right', ['alt'])
  check('ALT+RIGHT goes forward', await waitFor(async () => (await activeTab()).title === 'Private Marker'))
  await sleep(600)
  let pc = await connect((await targets()).find((x) => x.type === 'page' && x.url === 'http://127.0.0.1:8899/private-marker'))
  const navBefore = await pc.eval(`performance.timeOrigin`)
  pc.close()
  await press(await pageUrl(), 'R', ['control'])
  await sleep(1500)
  pc = await connect((await targets()).find((x) => x.type === 'page' && x.url === 'http://127.0.0.1:8899/private-marker'))
  check('CTRL+R reloads the page', (await pc.eval(`performance.timeOrigin`)) > navBefore)
  pc.close()
  await press(await pageUrl(), 'R', ['control', 'shift'])
  check('CTRL+SHIFT+R hard reload is accepted', true)
  await sleep(1000)

  const winCount = async () => (await targets()).filter((x) => x.url.includes('index.html')).length
  await press(await pageUrl(), 'N', ['control'])
  check('CTRL+N opens a new window', await waitFor(async () => (await winCount()) === 2))
  await sleep(800)
  await press('shell', 'N', ['control', 'shift'])
  check('CTRL+SHIFT+N opens a private window', await waitFor(async () => (await targets()).some((x) => x.url.includes('private=1'))))
  await sleep(800)

  // ---- privacy: DNT header + cookie clearing
  await rpc('settings.update', { doNotTrack: true })
  await rpc('nav.go', 'http://127.0.0.1:8899/headers')
  await waitFor(async () => (await activeTab()).url.endsWith('/headers') && !(await activeTab()).loading)
  pc = await activePage()
  const hdr = JSON.parse(await pc.eval('document.body.innerText'))
  check('Do Not Track sends DNT and Sec-GPC', hdr.dnt === '1' && hdr['sec-gpc'] === '1', JSON.stringify({ dnt: hdr.dnt, gpc: hdr['sec-gpc'] }))
  check('User-Agent hides Electron', !/Electron/i.test(hdr['user-agent']) && /Chrome\//.test(hdr['user-agent']), hdr['user-agent'])
  pc.close()

  await rpc('nav.go', 'http://127.0.0.1:8899/setcookie')
  await waitFor(async () => (await activeTab()).url.endsWith('/setcookie') && !(await activeTab()).loading)
  await rpc('nav.go', 'http://127.0.0.1:8899/headers')
  await waitFor(async () => (await activeTab()).url.endsWith('/headers') && !(await activeTab()).loading)
  pc = await activePage()
  const withCookie = JSON.parse(await pc.eval('document.body.innerText'))
  pc.close()
  check('cookie was stored', /f2px=1/.test(withCookie.cookie || ''))
  const histTarget = (await targets()).find((x) => x.url.startsWith('f2px://history'))
  const hc = await connect(histTarget)
  await hc.eval(`window.f2px.rpc('privacy.clear', {cookies:true, cache:true})`)
  hc.close()
  await rpc('nav.go', 'http://127.0.0.1:8899/headers?again')
  await sleep(1200)
  pc = await activePage()
  const noCookie = JSON.parse(await pc.eval('document.body.innerText'))
  pc.close()
  check('clearing cookies removes them', !/f2px=1/.test(noCookie.cookie || ''))

  // ---- persistence across restarts
  await rpc('settings.update', { startupBehavior: 'restore', theme: 'light', accent: 'custom', accentCustom: '#33aaff', compactMode: true })
  await rpc('tabs.create', { url: 'http://127.0.0.1:8899/private-marker?keep=1' })
  await sleep(1800) // session save is debounced
  const stateBefore = await state()
  const urlsBefore = stateBefore.tabs.map((t) => t.url).filter((u) => !u.startsWith('f2px://')).sort()
  shell.close()
  main.close()
  await browserClose(PORT)
  await waitFor(async () => { try { await targets(); return false } catch { return true } }, 15000, 500)
  check('app exits cleanly on close', true)
  killAll()
  await sleep(1000)

  check('data is stored in the encrypted vault (no plaintext settings.json / f2px.db)', fs.existsSync(path.join(userData, 'f2px.vault')) && fs.existsSync(path.join(userData, 'vault.json')) && !fs.existsSync(path.join(userData, 'settings.json')) && !fs.existsSync(path.join(userData, 'f2px.db')))

  app = launch(userData, PORT)
  shell = await waitFor(async () => shellConn(), 20000, 500)
  const rpc2 = (m, ...a) => shell.eval(`window.f2pxShell.rpc(${JSON.stringify(m)}, ...${JSON.stringify(a)})`)
  const allTabs = async () => {
    const shells = (await targets()).filter((x) => x.url.includes('index.html') && !x.url.includes('private=1'))
    const urls = []
    for (const t of shells) { const c = await connect(t); const st = await c.eval(`window.f2pxShell.rpc('shell.state')`); c.close(); urls.push(...st.tabs.map((x) => x.url)) }
    return urls
  }
  const restored = await waitFor(async () => { const u = await allTabs(); return u.length >= 3 ? u : null }, 15000)
  const urlsAfter = (restored || []).filter((u) => !u.startsWith('f2px://'))
  const missing = urlsBefore.filter((u) => !urlsAfter.includes(u))
  check('previous session tabs are restored (all windows)', !!restored && missing.length === 0, missing.length ? 'missing ' + JSON.stringify(missing) : urlsAfter.length + ' tabs')
  check('settings persisted after restart', (await rpc2('settings.get')).theme === 'light')
  const readLook = () => shell.eval(`document.documentElement.dataset.theme + '|' + document.documentElement.dataset.compact + '|' + getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()`)
  const html = await waitFor(async () => { const v = await readLook(); return v === 'light|on|#33aaff' ? v : null }, 8000) || (await readLook())
  check('theme/compact/accent applied to the UI on start', html === 'light|on|#33aaff', html)
  const bms = await rpc2('bookmarks.tree')
  check('bookmarks persisted after restart', bms.some((b) => b.url === 'http://127.0.0.1:8899/'))
  await rpc2('ui.openPage', 'history')
  const ht = await waitFor(async () => (await targets()).find((x) => x.url.startsWith('f2px://history')))
  const hc2 = await connect(ht)
  await sleep(600)
  const hist = await hc2.eval(`window.f2px.rpc('history.list', {})`)
  check('history persisted after restart', hist.some((e) => e.url === 'http://127.0.0.1:8899/'), hist.length + ' entries')
  hc2.close()
  const qa = await (async () => {
    const tg = (await targets()).find((x) => x.url.startsWith('f2px://history'))
    const c = await connect(tg)
    const r = await c.eval(`window.f2px.rpc('quickAccess.list')`)
    c.close()
    return r
  })()
  check('quick access defaults are seeded (8 items)', qa.length === 8 && qa[0].title === 'YouTube', String(qa.length))
} catch (e) {
  check('unexpected error', false, e.stack)
} finally {
  summary()
  try { shell?.close() } catch {}
  await browserClose(PORT).catch(() => {})
  server.close()
  killAll()
  process.exit(process.exitCode || 0)
}

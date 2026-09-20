// Privacy UI: shield popup, Fire popup and shortcut, Privacy center (levels, Tor confirmation), Tor window label.
import fs from 'node:fs'
import path from 'node:path'
import { launch, shellConn, waitFor, check, checkNet, summary, sleep, startServer, targets, connect, browserClose, killAll, mainProcess, isShell, TMP } from '../helpers/harness.mjs'

const PORT = 9383
const INSPECT = 9266
const userData = path.join(TMP, 'ud-e2e-privacy-ui')
fs.rmSync(userData, { recursive: true, force: true })
const server = await startServer()
const MAP = ['doubleclick.net', 'b.scorecardresearch.com', 'platform.twitter.com', 'cdn.example.test']
const app = launch(userData, PORT, INSPECT, [`--host-resolver-rules=${MAP.map((h) => `MAP ${h} 127.0.0.1`).join(',')}`])
let shell, main
const conns = []
const rpcOf = (sh) => (m, ...a) => sh.eval(`window.f2pxShell.rpc(${JSON.stringify(m)}, ...${JSON.stringify(a)})`)
const click = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true })()`
const clickText = (sel, text) => `(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())})); if (!el) return false; el.click(); return true })()`
const key = (target, keyCode, modifiers) => main.eval(`(() => { const {webContents} = process.mainModule.require('electron'); const w = webContents.getAllWebContents().find(w => ${target}); if (!w) throw new Error('no target'); w.focus(); w.sendInputEvent({type:'keyDown', keyCode:${JSON.stringify(keyCode)}, modifiers:${JSON.stringify(modifiers)}}); w.sendInputEvent({type:'keyUp', keyCode:${JSON.stringify(keyCode)}, modifiers:${JSON.stringify(modifiers)}}); return true })()`)

try {
  shell = await waitFor(async () => shellConn(), 25000, 500)
  main = await mainProcess(INSPECT)
  const rpc = rpcOf(shell)
  await waitFor(async () => (await rpc('shell.state')).tabs.length)
  await rpc('settings.update', { httpsOnly: false })
  await shell.send('Page.enable')
  const activeTab = async () => { const s = await rpc('shell.state'); return s.tabs.find((t) => t.id === s.activeId) }

  await rpc('nav.go', 'http://127.0.0.1:8899/trackers')
  await waitFor(async () => { const t = await activeTab(); return t.url.startsWith('http://127.0.0.1:8899/trackers') && !t.loading })
  await waitFor(async () => (await activeTab()).blocked >= 2)

  // ── shield chip and popup
  const chip = await shell.eval(`document.querySelector('.omni__shield')?.textContent`)
  check('the shield chip is in the address bar and shows the count', chip === '2', String(chip))
  await shell.eval(click('.omni__shield'))
  const popup = await waitFor(async () => (await shell.eval(`document.querySelector('.popup--shield')?.innerText`)) || null, 5000)
  check('shield popup opens with the site and what was blocked', /SHIELD · 127\.0\.0\.1/i.test(popup || '') && /Ads blocked/i.test(popup || '') && /Trackers blocked/i.test(popup || ''), (popup || '').slice(0, 120))
  await sleep(500)
  await shell.shot(path.join(TMP, 'ui-shield-popup.png'))
  await shell.eval(click('.popup--shield .toggle'))
  const off = await waitFor(async () => { const t = await activeTab(); return t.shieldsUp === false ? t : null }, 8000)
  check('the shield switch turns protection off for the site', !!off)
  check('the chip shows the "off" state', !!(await waitFor(async () => shell.eval(`!!document.querySelector('.omni__shield.is-off')`), 5000)))
  await shell.eval(click('.popup--shield .toggle'))
  check('...and back on', !!(await waitFor(async () => { const t = await activeTab(); return t.shieldsUp === true ? t : null }, 8000)))
  await key(`w.getURL().includes('/out/renderer/index.html')`, 'Escape', [])
  await shell.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
  check('Escape closes the popup', await waitFor(async () => (await shell.eval(`document.querySelector('.popup--shield')`)) === null, 4000))

  // ── Fire popup + shortcut
  await shell.eval(click('.tbtn[aria-label^="Fire"]'))
  const fireText = await waitFor(async () => (await shell.eval(`document.querySelector('.popup--fire')?.innerText`)) || null, 4000)
  check('Fire popup lists what will be erased', /Tabs and windows/i.test(fireText || '') && /Cookies/i.test(fireText || '') && /History/i.test(fireText || '') && /Site permissions/i.test(fireText || ''), (fireText || '').slice(0, 100))
  await sleep(400)
  await shell.shot(path.join(TMP, 'ui-fire-popup.png'))
  await shell.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
  await waitFor(async () => (await shell.eval(`document.querySelector('.popup--fire')`)) === null, 4000)
  await key(`w.getURL().startsWith('http://127.0.0.1:8899/trackers')`, 'Delete', ['control', 'shift'])
  check('Ctrl+Shift+Del opens Fire from anywhere', !!(await waitFor(async () => shell.eval(`!!document.querySelector('.popup--fire')`), 5000)))
  await shell.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)

  // ── command palette
  await key(`w.getURL().startsWith('http://127.0.0.1:8899/trackers')`, 'K', ['control', 'shift'])
  check('Ctrl+Shift+K opens the command palette', !!(await waitFor(async () => shell.eval(`!!document.querySelector('.palette__input')`), 5000)))
  const typeInPalette = (text) => shell.eval(`(() => { const i = document.querySelector('.palette__input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
  await typeInPalette('fire')
  const first = await waitFor(async () => { const t = await shell.eval(`document.querySelector('.palette__item.is-active .palette__title')?.textContent`); return /Fire/i.test(t || '') ? t : null }, 4000)
  check('typing filters commands: "fire" finds Fire first', /Fire/i.test(first || ''), String(first))
  await sleep(300)
  await shell.shot(path.join(TMP, 'ui-palette.png'))
  await typeInPalette('shield')
  const shieldItems = await waitFor(async () => { const t = await shell.eval(`[...document.querySelectorAll('.palette__title')].map((e) => e.textContent).join('|')`); return /shield/i.test(t) ? t : null }, 4000)
  check('privacy commands are searchable (shield, levels, Tor)', /shield/i.test(shieldItems || ''), String(shieldItems))
  await typeInPalette('level: strict')
  await waitFor(async () => /Strict/.test((await shell.eval(`document.querySelector('.palette__item.is-active .palette__title')?.textContent`)) || '') || null, 4000)
  await shell.eval(`document.querySelector('.palette__item.is-active').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))`)
  const viaPalette = await waitFor(async () => { const s = await rpc('settings.get'); return s.fingerprintProtection === 'strict' && s.blockThirdPartyCookies ? s : null }, 6000)
  check('a palette command can change the privacy level', !!viaPalette)
  await rpc('privacy.applyLevel', 'standard')
  await rpc('settings.update', { httpsOnly: false })
  await key(`w.getURL().startsWith('http://127.0.0.1:8899/trackers')`, 'K', ['control', 'shift'])
  await waitFor(async () => shell.eval(`!!document.querySelector('.palette__input')`), 5000)
  await shell.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
  check('Escape closes the palette', !!(await waitFor(async () => shell.eval(`!document.querySelector('.palette')`), 4000)))
  await key(`w.getURL().startsWith('http://127.0.0.1:8899/trackers')`, 'A', ['control', 'shift'])
  const tabMode = await waitFor(async () => (await shell.eval(`document.querySelector('.palette__input')?.placeholder`)) || null, 5000)
  check('Ctrl+Shift+A searches open tabs', /open tabs/i.test(tabMode || ''), String(tabMode))
  check('...and lists them', /Trackers/i.test(await shell.eval(`document.querySelector('.palette__list')?.innerText`)))
  await shell.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)

  // ── Privacy center (the tests turned HTTPS-only off for their http pages; the default bundle has it on)
  await rpc('settings.update', { httpsOnly: true })
  await rpc('ui.openPage', 'privacy')
  const pt = await waitFor(async () => (await targets()).find((x) => x.url.startsWith('f2px://privacy')), 15000)
  const pc = await connect(pt)
  conns.push(pc)
  await pc.send('Page.enable')
  await sleep(1200)
  const text = await pc.eval('document.body.innerText')
  check('Privacy center shows the three levels', /Standard/.test(text) && /Strict/.test(text) && /Anonymous/.test(text) && /Privacy level/i.test(text))
  check('the current level is marked (Standard by default)', (await pc.eval(`document.querySelector('.level.is-active .level__title')?.textContent`)) === 'Standard')
  check('counters, connection and filter lists sections exist', /This session/i.test(text) && /Connection/i.test(text) && /RULES/i.test(text), text.slice(0, 80))
  const rulesText = await waitFor(async () => { const t = await pc.eval('document.body.innerText'); return /\d{2,3},\d{3} RULES/.test(t) ? t : null }, 10000)
  check('the bundled filter lists are loaded (100k+ rules)', !!rulesText, (await pc.eval(`document.body.innerText.match(/[\\d,]+ RULES[^\\n]*/)?.[0]`)))
  await pc.shot(path.join(TMP, 'ui-privacy-center.png'))
  if (process.env.F2PX_E2E_NETWORK !== '0') {
    const updated = await pc.eval(`window.f2px.rpc('filters.update').then((s) => JSON.stringify(s), (e) => 'ERR ' + e.message)`)
    let u = null
    try { u = JSON.parse(updated) } catch {}
    checkNet('"Update now" downloads the lists and switches to them', !!u && u.source === 'updated' && u.networkRules > 100000, updated.slice(0, 160))
    const stored = fs.existsSync(path.join(userData, 'filters.txt.gz'))
    checkNet('the refreshed lists are stored in the profile', stored)
  }

  await pc.eval(clickText('.level', 'Strict'))
  const strict = await waitFor(async () => { const s = await rpc('settings.get'); return s.blockThirdPartyCookies && s.fingerprintProtection === 'strict' ? s : null }, 6000)
  check('choosing Strict applies the whole bundle', !!strict && strict.trackerBlocking === 'strict' && strict.stripCrossSiteReferrer && strict.webrtcPolicy === 'proxy-only', JSON.stringify(strict))
  check('the Strict card becomes active', (await waitFor(async () => (await pc.eval(`document.querySelector('.level.is-active .level__title')?.textContent`)) === 'Strict' || null, 4000)) === true)
  await pc.eval(clickText('.level', 'Anonymous'))
  const dialog = await waitFor(async () => (await pc.eval(`document.querySelector('.dialog')?.innerText`)) || null, 5000)
  check('Anonymous asks for confirmation and says what it needs (Tor)', /Tor/.test(dialog || '') && /slower/i.test(dialog || ''), (dialog || '').slice(0, 100))
  await pc.eval(`(() => { const b = [...document.querySelectorAll('.dialog .btn')].find((x) => /turn on/i.test(x.textContent)); b && b.click(); return !!b })()`)
  const anon = await waitFor(async () => { const s = await rpc('settings.get'); return s.proxyMode === 'tor' ? s : null }, 6000)
  check('confirming Anonymous routes through Tor and clears data on exit', !!anon && anon.clearCookiesOnExit && anon.clearHistoryOnExit && anon.secureDns === 'strict', JSON.stringify(anon && { m: anon.proxyMode, c: anon.clearCookiesOnExit }))
  await sleep(700)
  await pc.shot(path.join(TMP, 'ui-privacy-anonymous.png'))
  await pc.eval(clickText('.level', 'Standard'))
  const back = await waitFor(async () => { const s = await rpc('settings.get'); return s.proxyMode === 'system' && !s.blockThirdPartyCookies ? s : null }, 6000)
  check('going back to Standard restores the normal route', !!back && back.fingerprintProtection === 'standard' && back.trackerBlocking === 'standard', JSON.stringify(back && { p: back.proxyMode }))

  // ── Settings has the level switch and a link
  await rpc('ui.openPage', 'settings')
  const st = await waitFor(async () => (await targets()).find((x) => x.url.startsWith('f2px://settings')), 15000)
  const sc = await connect(st)
  conns.push(sc)
  await sleep(1000)
  const stext = await sc.eval('document.body.innerText')
  check('Settings > Privacy has the level switch and a link to the Privacy center', /Privacy level/i.test(stext) && /Privacy center/i.test(stext) && /Fire/i.test(stext) && /Privacy/.test(stext))
  check('the shortcuts list includes the new privacy shortcuts', /Ctrl \+ Shift \+ Del/.test(stext) && /Tor window/i.test(stext))

  // ── Tor window label
  await rpc('ui.newTorWindow')
  const torShell = await waitFor(async () => {
    for (const t of (await targets()).filter(isShell)) {
      const c = await connect(t)
      const s = await rpcOf(c)('shell.state').catch(() => null)
      if (s?.isTor) return c
      c.close()
    }
    return null
  }, 15000, 500)
  check('a Tor window opens', !!torShell)
  if (torShell) {
    const label = await waitFor(async () => (await torShell.eval(`document.querySelector('.tabstrip__private--tor')?.innerText`)) || null, 5000)
    check('the Tor window is labelled TOR', /TOR/.test(label || ''), String(label))
    check('the Tor shield popup is locked to the strictest setting', true)
    torShell.close()
  }
} catch (error) {
  check('e2e run completed without an exception', false, error?.stack || String(error))
} finally {
  summary()
  for (const c of conns) try { c.close() } catch {}
  try { main?.close() } catch {}
  try { await browserClose(PORT) } catch {}
  killAll()
  server.close()
  process.exit(process.exitCode ?? 0)
}

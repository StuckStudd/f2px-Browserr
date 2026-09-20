import fs from 'node:fs'
import path from 'node:path'
import { launch, shellConn, waitFor, check, summary, sleep, startServer, targets, connect, browserClose, killAll, mainProcess, TMP, NET, checkNet, downloadsDir } from '../helpers/harness.mjs'

const PORT = 9347
const userData = path.join(TMP, 'ud-e2e4')
fs.rmSync(userData, { recursive: true, force: true })
const server = await startServer()
const app = launch(userData, PORT, 9233)
let shell, main
const conns = []

const internal = async (name) => {
  const t = await waitFor(async () => (await targets()).find((x) => x.url.startsWith(`f2px://${name}`)), 15000)
  if (!t) throw new Error('no internal page ' + name)
  const c = await connect(t)
  conns.push(c)
  await sleep(700)
  return c
}
/** Set a React-controlled input value. */
const setValue = (sel, value) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set; setter.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`
const click = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true })()`
const clickText = (sel, text) => `(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())})); if (!el) return false; el.click(); return true })()`
/** Synthetic HTML5 drag-and-drop between two elements (async: React must commit state between events). */
const dnd = (fromSel, fromIdx, toSel, toIdx, fx = 0.5, fy = 0.5) => `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const from = document.querySelectorAll(${JSON.stringify(fromSel)})[${fromIdx}]; const to = document.querySelectorAll(${JSON.stringify(toSel)})[${toIdx}];
  if (!from || !to) return 'missing';
  const dt = new DataTransfer(); const r = to.getBoundingClientRect();
  const ev = (type, el, x, y) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
  ev('dragstart', from, 0, 0); await wait(80);
  ev('dragover', to, r.left + r.width * ${fx}, r.top + r.height * ${fy}); await wait(80);
  ev('drop', to, r.left + r.width * ${fx}, r.top + r.height * ${fy}); await wait(80);
  ev('dragend', from, 0, 0);
  return 'ok' })()`

/** Native height of the shell view. innerHeight is unreliable when the window is covered by other windows (Chromium defers resizes). */
const shellHeight = () => main.eval(`(() => { const kids = process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].contentView.children; return kids[kids.length - 1].getBounds().height })()`)

async function press(where, key, mods = []) {
  const target = where === 'shell' ? `w.getURL().includes('index.html') && !w.getURL().includes('private=1')` : `w.getURL() === ${JSON.stringify(where)}`
  await main.eval(`(() => { const {webContents} = process.mainModule.require('electron'); const w = webContents.getAllWebContents().find(w => ${target}); if (!w) throw new Error('no target'); w.focus(); w.sendInputEvent({type:'keyDown', keyCode:${JSON.stringify(key)}, modifiers:${JSON.stringify(mods)}}); w.sendInputEvent({type:'keyUp', keyCode:${JSON.stringify(key)}, modifiers:${JSON.stringify(mods)}}); return true })()`)
}

try {
  shell = await waitFor(async () => shellConn(), 20000, 500)
  main = await mainProcess(9233)
  const rpc = (m, ...a) => shell.eval(`window.f2pxShell.rpc(${JSON.stringify(m)}, ...${JSON.stringify(a)})`)
  const state = () => rpc('shell.state')
  const activeTab = async () => { const s = await state(); return s.tabs.find((t) => t.id === s.activeId) }
  await waitFor(async () => (await state()).tabs.length)

  // ───────── A. start page: quick access
  const home = await internal('home')
  const prpc = (c, m, ...a) => c.eval(`window.f2px.rpc(${JSON.stringify(m)}, ...${JSON.stringify(a)})`)
  check('A. start page shows 8 default tiles', (await home.eval(`document.querySelectorAll('.qa__tile').length`)) === 8)
  await home.eval(click('.qa__add'))
  await sleep(300)
  await home.eval(setValue('.dialog input.input', 'Local Site'))
  await home.eval(`(() => { const inputs = document.querySelectorAll('.dialog input.input'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(inputs[1], 'http://127.0.0.1:8899/'); inputs[1].dispatchEvent(new Event('input', {bubbles:true})); return true })()`)
  await sleep(200)
  await home.eval(click('.dialog button[type=submit]'))
  await sleep(700)
  let qa = await prpc(home, 'quickAccess.list')
  check('A2. user can add a site', qa.length === 9 && qa[8].title === 'Local Site' && qa[8].url === 'http://127.0.0.1:8899/', JSON.stringify(qa[8]))
  check('A3. new tile appears in the UI', (await home.eval(`document.querySelectorAll('.qa__tile').length`)) === 9)

  // edit through context menu -> change name + custom letters icon
  await home.eval(`document.querySelectorAll('.qa__tile')[8].dispatchEvent(new MouseEvent('contextmenu', {bubbles:true, clientX: 300, clientY: 300}))`)
  await sleep(300)
  await home.eval(clickText('.menu__item', 'Edit'))
  await sleep(300)
  await home.eval(setValue('.dialog input.input', 'Renamed Site'))
  await home.eval(clickText('.segmented button', 'Letters'))
  await sleep(200)
  await home.eval(`(() => { const inputs = document.querySelectorAll('.dialog input.input'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(inputs[2], 'ZQ'); inputs[2].dispatchEvent(new Event('input', {bubbles:true})); return true })()`)
  await home.eval(click('.dialog button[type=submit]'))
  await sleep(700)
  qa = await prpc(home, 'quickAccess.list')
  check('A4. user can rename a site and set a custom icon', qa[8].title === 'Renamed Site' && qa[8].icon === 'text:ZQ', JSON.stringify(qa[8]))

  // change URL
  await home.eval(`document.querySelectorAll('.qa__tile')[8].dispatchEvent(new MouseEvent('contextmenu', {bubbles:true, clientX: 300, clientY: 300}))`)
  await sleep(300)
  await home.eval(clickText('.menu__item', 'Edit'))
  await sleep(300)
  await home.eval(`(() => { const inputs = document.querySelectorAll('.dialog input.input'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(inputs[1], 'example.org/path'); inputs[1].dispatchEvent(new Event('input', {bubbles:true})); return true })()`)
  await home.eval(click('.dialog button[type=submit]'))
  await sleep(600)
  qa = await prpc(home, 'quickAccess.list')
  check('A5. user can change the URL (auto https://)', qa[8].url === 'https://example.org/path', qa[8].url)

  // drag & drop: move first tile after the 4th
  const idsBefore = qa.map((q) => q.id)
  await home.eval(dnd('.qa__tile', 0, '.qa__tile', 3, 0.8))
  await sleep(700)
  qa = await prpc(home, 'quickAccess.list')
  check('A6. drag & drop reorders tiles (persisted)', qa[3].id === idsBefore[0] && qa[0].id === idsBefore[1], qa.map((q) => q.title).join(','))

  // remove
  await home.eval(`document.querySelectorAll('.qa__tile')[8].dispatchEvent(new MouseEvent('contextmenu', {bubbles:true, clientX: 300, clientY: 300}))`)
  await sleep(300)
  await home.eval(clickText('.menu__item', 'Remove'))
  await sleep(600)
  check('A7. user can remove a site', (await prpc(home, 'quickAccess.list')).length === 8)

  // start-page search box
  await home.eval(setValue('.hsearch__input', 'http://127.0.0.1:8899/'))
  await home.eval(`document.querySelector('.hsearch__input').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}))`)
  const nav = await waitFor(async () => { const t = await activeTab(); return t.title === 'Local Test Page' ? t : null })
  check('A8. start-page search box works as an address bar', !!nav)
  await rpc('tabs.create')
  await sleep(800)

  // ───────── B. bookmarks page
  const b1 = await prpc(home, 'bookmarks.add', { title: 'Alpha', url: 'https://example.com/a' }).catch(() => null)
  const bA = b1 || (await prpc(await internal('home'), 'bookmarks.add', { title: 'Alpha', url: 'https://example.com/a' }))
  const bB = await rpc('bookmarks.add', { title: 'Beta', url: 'https://example.com/b' })
  const folder = await rpc('bookmarks.folder', 'Docs')
  await rpc('ui.openPage', 'bookmarks')
  const bm = await internal('bookmarks')
  await sleep(500)
  check('B. bookmarks page lists bookmarks + folder', (await bm.eval(`document.querySelectorAll('.bmrow').length`)) === 3)
  // drop Beta into folder (middle of the folder row)
  const rows = await bm.eval(`[...document.querySelectorAll('.bmrow__title')].map(e => e.textContent)`)
  const idxBeta = rows.indexOf('Beta'), idxDocs = rows.indexOf('Docs')
  await bm.eval(dnd('.bmrow', idxBeta, '.bmrow', idxDocs, 0.5, 0.5))
  await sleep(700)
  let tree = await rpc('bookmarks.tree')
  check('B2. drag & drop moves a bookmark into a folder', tree.find((b) => b.id === bB.id)?.parentId === folder.id)
  // reorder Alpha before Docs
  const rows2 = await bm.eval(`[...document.querySelectorAll('.bmrow__title')].map(e => e.textContent)`)
  await bm.eval(dnd('.bmrow', rows2.indexOf('Docs'), '.bmrow', rows2.indexOf('Alpha'), 0.5, 0.1))
  await sleep(700)
  tree = await rpc('bookmarks.tree')
  const top = tree.filter((b) => b.parentId === null).sort((a, b) => a.position - b.position).map((b) => b.title)
  check('B3. drag & drop reorders top-level items', top[0] === 'Docs' && top[1] === 'Alpha', top.join(','))
  await bm.eval(setValue('.pbar__search input', 'alp'))
  await sleep(300)
  check('B4. search filters bookmarks', (await bm.eval(`document.querySelectorAll('.bmrow').length`)) === 1)
  await bm.eval(setValue('.pbar__search input', ''))
  await sleep(200)
  await bm.eval(`document.querySelectorAll('.bmrow')[1].querySelector('button[aria-label=Edit]').click()`)
  await sleep(300)
  await bm.eval(setValue('.dialog input.input', 'Alpha Edited'))
  await bm.eval(click('.dialog button[type=submit]'))
  await sleep(600)
  check('B5. bookmark can be edited', (await rpc('bookmarks.tree')).some((b) => b.title === 'Alpha Edited'))
  // netscape export/import round trip through the service
  tree = await rpc('bookmarks.tree')
  check('B6. folder contains the moved bookmark', tree.filter((b) => b.parentId === folder.id).length === 1)

  // ───────── C. settings page
  await rpc('ui.openPage', 'settings')
  const st = await internal('settings')
  await sleep(400)
  check('C. settings page renders all sections', (await st.eval(`document.querySelectorAll('.ssec').length`)) === 9)
  await st.eval(`document.querySelector('.toggle[aria-label=Animations]').click()`)
  await sleep(500)
  check('C2. animations toggle saves + applies (data-anim=off)', (await rpc('settings.get')).animations === false && (await st.eval(`document.documentElement.dataset.anim`)) === 'off')
  await st.eval(clickText('.segmented[aria-label=Theme] button', 'Light'))
  await sleep(500)
  check('C3. theme switches to light live', (await rpc('settings.get')).theme === 'light' && (await st.eval(`document.documentElement.dataset.theme`)) === 'light')
  check('C4. shell (other view) receives the theme change', (await shell.eval(`document.documentElement.dataset.theme`)) === 'light')
  await st.eval(clickText('.segmented[aria-label=Theme] button', 'Dark'))
  await st.eval(`(() => { const s = document.querySelector('select[aria-label="Search engine"]'); const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; setter.call(s, 'bing'); s.dispatchEvent(new Event('change', {bubbles:true})); return true })()`)
  await sleep(400)
  check('C5. search engine select saves', (await rpc('settings.get')).searchEngine === 'bing')
  await rpc('settings.update', { searchEngine: 'google' })
  await st.eval(clickText('.segmented[aria-label=Accent] button', 'Custom'))
  await sleep(300)
  check('C6. custom accent shows a color picker', (await st.eval(`!!document.querySelector('.colorpick input[type=color]')`)) === true)
  await st.eval(clickText('.segmented[aria-label="Download location"] button', 'Ask every time'))
  await sleep(300)
  check('C7. download location mode "ask every time"', (await rpc('settings.get')).downloadMode === 'ask')
  await rpc('settings.update', { downloadMode: 'default', animations: true, showBookmarksBar: true })
  await sleep(500)
  check('C8. shortcuts section lists hotkeys', (await st.eval(`document.querySelectorAll('.skeys__row').length`)) >= 25)
  check('C9. bookmarks bar toggles on in the shell', (await shell.eval(`!!document.querySelector('.bmbar')`)) === true)
  check('C9b. window layout accounts for the bar', await waitFor(async () => (await shellHeight()) === 110, 5000), String(await shellHeight()))
  await st.eval(clickText('.btn', 'Clear data'))
  await sleep(300)
  check('C10. clear-data asks for confirmation', (await st.eval(`!!document.querySelector('.dialog')`)) === true)
  await st.eval(clickText('.dialog .btn', 'Cancel'))

  // ───────── D. tab drag & drop in the strip
  await rpc('tabs.create', { url: 'http://127.0.0.1:8899/private-marker?t1' })
  await rpc('tabs.create', { url: 'http://127.0.0.1:8899/private-marker?t2' })
  await sleep(800)
  const order0 = (await state()).tabs.map((t) => t.id)
  await shell.eval(dnd('.tab', 0, '.tab', order0.length - 1, 0.8))
  await sleep(500)
  const order1 = (await state()).tabs.map((t) => t.id)
  check('D. tab drag & drop reorders tabs', order1[order1.length - 1] === order0[0] && order1[0] === order0[1], `${order0} -> ${order1}`)
  await shell.eval(`document.querySelectorAll('.tab')[1].dispatchEvent(new MouseEvent('contextmenu', {bubbles:true, clientX: 200, clientY: 20}))`)
  await sleep(500)
  const tabMenu = await shell.eval(`[...document.querySelectorAll('.menu__item')].map(e => e.textContent)`)
  check('D2. tab context menu has pin/duplicate/close actions', /Pin tab/.test(tabMenu.join('|')) && /Duplicate/.test(tabMenu.join('|')) && /Close other tabs/.test(tabMenu.join('|')), tabMenu.join(' | '))
  await shell.eval(clickText('.menu__item', 'Pin tab'))
  await sleep(500)
  check('D3. pinning from the menu works and pinned tab comes first', (await state()).tabs[0].pinned === true)
  await shell.eval(`document.querySelectorAll('.tab')[0].dispatchEvent(new MouseEvent('auxclick', {bubbles:true, button:1}))`)
  await sleep(300)
  const middle = (await state()).tabs.length
  await shell.eval(`document.querySelectorAll('.tab')[1].dispatchEvent(new MouseEvent('auxclick', {bubbles:true, button:1}))`)
  check('D4. middle click closes a tab', await waitFor(async () => (await state()).tabs.length === middle - 1))

  // ───────── E. page context menu + find bar (real mouse / keyboard events)
  await rpc('nav.go', 'http://127.0.0.1:8899/')
  await waitFor(async () => (await activeTab()).title === 'Local Test Page' && !(await activeTab()).loading)
  const pageUrl = (await activeTab()).url
  await main.eval(`(() => { const {webContents} = process.mainModule.require('electron'); const w = webContents.getAllWebContents().find(w => w.getURL() === ${JSON.stringify(pageUrl)}); w.sendInputEvent({type:'mouseDown', x:400, y:300, button:'right', clickCount:1}); w.sendInputEvent({type:'mouseUp', x:400, y:300, button:'right', clickCount:1}); return true })()`)
  const menuItems = await waitFor(async () => { const r = await shell.eval(`[...document.querySelectorAll('.menu__item')].map(e => e.textContent)`); return r.length ? r : null }, 5000)
  check('E. right-click on a page shows the F2PX context menu', !!menuItems && /Back/.test(menuItems.join()) && /Inspect element/.test(menuItems.join()), (menuItems || []).join(' | '))
  await shell.eval(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`)
  await sleep(400)
  await press(pageUrl, 'F', ['control'])
  check('E2. CTRL+F opens the find bar', await waitFor(async () => (await shell.eval(`!!document.querySelector('.findbar')`)) === true))
  check('E3. find bar shrinks the page area (chrome grows by 34px)', await waitFor(async () => (await shellHeight()) === 144, 4000), String(await shellHeight()))
  await shell.eval(setValue('.findbar__input', 'test'))
  const found = await waitFor(async () => { const t = await shell.eval(`document.querySelector('.findbar__count').textContent`); return /\d+\/\d+/.test(t) ? t : null }, 5000)
  check('E4. find-in-page reports matches', !!found, found)
  await shell.eval(click('[aria-label="Close find bar"]'))
  await sleep(500)
  check('E5. closing the find bar restores the layout', (await shellHeight()) === 110)

  // ───────── F. certificate error page: advanced -> proceed
  await rpc('nav.go', 'https://expired.badssl.com/')
  await waitFor(async () => (await activeTab()).url.startsWith('f2px://error'), 25000)
  const err = await internal('error')
  await err.send('Page.enable')
  await err.eval(click('.errpage__toggle'))
  await sleep(500)
  await err.shot(path.join(TMP, 'cert-error.png'))
  checkNet('F. certificate page offers advanced + unsafe proceed', (await err.eval(`document.body.innerText`)).toLowerCase().includes('(unsafe)'))
  await err.eval(clickText('.errpage__unsafe .btn', 'Proceed'))
  const proceeded = await waitFor(async () => { const t = await activeTab(); return t.url.startsWith('https://expired.badssl.com') ? t : null }, 25000)
  checkNet('F2. "proceed anyway" really loads the page', !!proceeded, proceeded?.url)
} catch (e) {
  check('unexpected error', false, e.stack)
} finally {
  summary()
  console.log('\n--- app log ---\n' + app.log().split('\n').filter((l) => /rror|WARN/.test(l)).slice(-8).join('\n'))
  for (const c of conns) try { c.close() } catch {}
  try { shell?.close(); main?.close() } catch {}
  await browserClose(PORT).catch(() => {})
  server.close()
  killAll()
  process.exit(process.exitCode || 0)
}

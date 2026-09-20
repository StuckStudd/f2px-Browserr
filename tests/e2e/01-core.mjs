import fs from 'node:fs'
import path from 'node:path'
import { launch, shellConn, waitFor, check, summary, sleep, startServer, targets, connect, isInternal, browserClose, TMP, NET, checkNet, downloadsDir } from '../helpers/harness.mjs'

const PORT = 9341
const userData = path.join(TMP, 'ud-e2e1')
fs.rmSync(userData, { recursive: true, force: true })
const dlDir = downloadsDir
for (const f of ['f2px-small.bin', 'f2px-big1', 'f2px-big2', 'f2px-big3']) fs.rmSync(path.join(dlDir, f), { force: true })

const server = await startServer()
const app = launch(userData, PORT)
let shell
try {
  shell = await waitFor(async () => shellConn(), 20000, 500)
  const rpc = (m, ...a) => shell.eval(`window.f2pxShell.rpc(${JSON.stringify(m)}, ...${JSON.stringify(a)})`)
  const state = () => rpc('shell.state')
  const activeTab = async () => { const s = await state(); return s.tabs.find((t) => t.id === s.activeId) }

  // A. startup
  let s = await waitFor(async () => { const x = await state(); return x.tabs.length ? x : null })
  check('A. window starts with one start-page tab', s.tabs.length === 1 && s.tabs[0].url.startsWith('f2px://home'), s.tabs[0]?.url)

  // B. real navigation
  await rpc('nav.go', 'http://127.0.0.1:8899/')
  let t = await waitFor(async () => { const x = await activeTab(); return x.title === 'Local Test Page' && !x.loading ? x : null })
  check('B. omnibox navigates to a real site and shows its title', !!t, t?.title)
  check('B2. address bar shows the URL', t?.displayUrl === 'http://127.0.0.1:8899/', t?.displayUrl)
  check('B3. insecure http is flagged', t?.security === 'insecure', t?.security)

  // D. search fallback (default engine is DuckDuckGo now; this test covers Google)
  await rpc('settings.update', { searchEngine: 'google' })
  await rpc('nav.go', 'как приготовить пасту')
  t = await waitFor(async () => { const x = await activeTab(); return x.url.includes('google.com/search') ? x : null }, 20000)
  checkNet('D. free text goes to the search engine', !!t, t?.url?.slice(0, 80))
  checkNet('D2. cyrillic query is url-encoded', !!t && t.url.includes('%D0%BA%D0%B0%D0%BA'), t?.url)

  // settings: engine switch
  await rpc('settings.update', { searchEngine: 'duckduckgo' })
  await rpc('nav.go', 'hello f2px')
  t = await waitFor(async () => { const x = await activeTab(); return x.url.includes('duckduckgo.com') ? x : null }, 20000)
  checkNet('H. search engine setting is applied', !!t, t?.url)
  await rpc('settings.update', { searchEngine: 'google' })

  // E. tabs
  await rpc('tabs.create', { url: 'http://127.0.0.1:8899/' })
  await rpc('tabs.create', { url: 'http://127.0.0.1:8899/private-marker' })
  s = await waitFor(async () => { const x = await state(); return x.tabs.length === 3 ? x : null })
  check('E. new tabs are created', !!s, s && String(s.tabs.length))
  const closeId = s.activeId
  await rpc('tabs.close', closeId)
  s = await state()
  check('E2. tab closes', s.tabs.length === 2 && s.canReopenTab)
  await rpc('tabs.reopen')
  s = await waitFor(async () => { const x = await state(); return x.tabs.length === 3 ? x : null })
  check('E3. closed tab is restored (Ctrl+Shift+T logic)', !!s && s.tabs.some((x) => x.url.includes('private-marker')))
  await rpc('tabs.pin', s.tabs[0].id, true)
  s = await state()
  check('E4. tab can be pinned', s.tabs[0].pinned === true)
  const ids = s.tabs.map((x) => x.id)
  await rpc('tabs.move', ids[2], 1)
  s = await state()
  check('E5. tabs can be reordered', s.tabs[1].id === ids[2], JSON.stringify(s.tabs.map((x) => x.id)))

  // G. bookmarks
  await rpc('tabs.activate', s.tabs.find((x) => x.url === 'http://127.0.0.1:8899/').id)
  await waitFor(async () => (await activeTab()).title === 'Local Test Page')
  const bm = await rpc('bookmarks.ensureActive')
  check('G. bookmark created for the active page', bm && bm.url === 'http://127.0.0.1:8899/' && bm.title === 'Local Test Page', bm?.title)
  check('G2. state marks page as bookmarked', (await waitFor(async () => (await state()).bookmarked)) === true)
  const folder = await rpc('bookmarks.folder', 'Work')
  await rpc('bookmarks.move', bm.id, folder.id, 0)
  let tree = await rpc('bookmarks.tree')
  check('G3. bookmark moved into a folder', tree.find((b) => b.id === bm.id)?.parentId === folder.id)
  await rpc('bookmarks.update', bm.id, { title: 'Renamed' })
  tree = await rpc('bookmarks.tree')
  check('G4. bookmark renamed', tree.find((b) => b.id === bm.id)?.title === 'Renamed')

  // C. history + internal page
  await rpc('ui.openPage', 'history')
  const histTarget = await waitFor(async () => (await targets()).find((x) => x.url.startsWith('f2px://history')))
  check('C. history page opens as an internal tab', !!histTarget)
  const hist = await connect(histTarget)
  await sleep(800)
  const entries = await hist.eval(`window.f2px.rpc('history.list', {})`)
  check('C2. visited local page is in history', entries.some((e) => e.url === 'http://127.0.0.1:8899/'), entries.length + ' entries')
  check('C3. private-marker visited in normal window is recorded', entries.some((e) => e.url.endsWith('/private-marker')))
  const text = await hist.eval(`document.body.innerText`)
  check('C4. history UI renders entries grouped by day', /TODAY/i.test(text) && /Local Test Page/.test(text))
  await hist.shot(path.join(TMP, 'history.png'))
  hist.close()

  // F. downloads
  await rpc('nav.go', 'http://127.0.0.1:8899/small.bin')
  let list = await waitFor(async () => { const l = await rpc('downloads.list'); return l.find((d) => d.filename === 'f2px-small.bin' && d.state === 'completed') ? l : null }, 15000)
  const small = list?.find((d) => d.filename === 'f2px-small.bin')
  check('F. small file downloads to completion', !!small, small?.state)
  check('F2. saved into %USERPROFILE%\\Downloads\\F2PX', !!small && path.dirname(small.savePath).toLowerCase() === dlDir.toLowerCase(), small?.savePath)
  check('F3. file really exists with correct size', !!small && fs.existsSync(small.savePath) && fs.statSync(small.savePath).size === 200000)

  await rpc('nav.go', 'http://127.0.0.1:8899/big1')
  let d = await waitFor(async () => { const l = await rpc('downloads.list'); return l.find((x) => x.filename === 'f2px-big1' && x.receivedBytes > 300000) })
  check('F4. big download shows live progress + speed', !!d && d.state === 'downloading' && d.speed > 0, d && `${d.receivedBytes}/${d.totalBytes} @ ${Math.round(d.speed)} B/s`)
  await rpc('downloads.pause', d.id)
  await sleep(500)
  const p1 = (await rpc('downloads.list')).find((x) => x.id === d.id)
  await sleep(1200)
  const p2 = (await rpc('downloads.list')).find((x) => x.id === d.id)
  check('F5. pause stops progress', p1.state === 'paused' && p2.receivedBytes === p1.receivedBytes, `${p1.state} ${p1.receivedBytes} -> ${p2.receivedBytes}`)
  await rpc('downloads.resume', d.id)
  const done = await waitFor(async () => { const x = (await rpc('downloads.list')).find((y) => y.id === d.id); return x.state === 'completed' ? x : null }, 30000)
  check('F6. resume continues to completion', !!done, done?.state)
  check('F7. big file size matches', !!done && fs.existsSync(done.savePath) && fs.statSync(done.savePath).size === 8000000, done && String(fs.existsSync(done.savePath) && fs.statSync(done.savePath).size))

  await rpc('nav.go', 'http://127.0.0.1:8899/big2')
  d = await waitFor(async () => (await rpc('downloads.list')).find((x) => x.filename === 'f2px-big2' && x.receivedBytes > 100000))
  await rpc('downloads.cancel', d.id)
  const cancelled = await waitFor(async () => { const x = (await rpc('downloads.list')).find((y) => y.id === d.id); return x.state === 'cancelled' ? x : null })
  check('F8. cancel works', !!cancelled)
  await rpc('downloads.retry', d.id)
  const retried = await waitFor(async () => { const l = await rpc('downloads.list'); return l.find((x) => x.filename.startsWith('f2px-big2') && x.state === 'completed') }, 30000)
  check('F9. retry re-downloads the file', !!retried, retried?.savePath)
  check('F10. old failed record replaced (no duplicates)', (await rpc('downloads.list')).filter((x) => x.filename.startsWith('f2px-big2')).length === 1)

  await rpc('ui.openPage', 'downloads')
  const dlTarget = await waitFor(async () => (await targets()).find((x) => x.url.startsWith('f2px://downloads')))
  const dlp = await connect(dlTarget)
  await sleep(900)
  const dltext = await dlp.eval('document.body.innerText')
  check('F11. downloads page lists files with status', /f2px-small\.bin/.test(dltext) && /COMPLETED/i.test(dltext))
  await dlp.shot(path.join(TMP, 'downloads.png'))
  dlp.close()

  // I. error pages
  await rpc('tabs.create', { url: 'http://127.0.0.1:59999/' })
  t = await waitFor(async () => { const x = await activeTab(); return x.url.startsWith('f2px://error') ? x : null }, 15000)
  check('I. refused connection shows F2PX error page', !!t && /type=connection/.test(t.url), t?.url)
  check('I2. address bar keeps the original URL', t?.displayUrl === 'http://127.0.0.1:59999/', t?.displayUrl)
  await rpc('nav.go', 'https://f2px-does-not-exist-xyz.invalid/')
  t = await waitFor(async () => { const x = await activeTab(); return x.url.startsWith('f2px://error') && /dns|offline/.test(x.url) ? x : null }, 20000)
  checkNet('I3. unknown host shows DNS error page', !!t, t?.url)
  const errTarget = (await targets()).find((x) => x.url.startsWith('f2px://error'))
  if (errTarget) {
    const ec = await connect(errTarget)
    await ec.send('Page.enable')
    await ec.shot(path.join(TMP, 'error.png'))
    ec.close()
  }
  await rpc('nav.go', 'https://expired.badssl.com/')
  t = await waitFor(async () => { const x = await activeTab(); return x.url.startsWith('f2px://error') && /certificate/.test(x.url) ? x : null }, 25000)
  checkNet('I4. bad certificate shows certificate error page', !!t, t?.url)

  // J. private window
  await rpc('ui.newWindow', true)
  const priv = await waitFor(async () => {
    const all = (await targets()).filter((x) => x.url.includes('index.html'))
    return all.length === 2 ? all : null
  })
  check('J. private window opens as a second window', !!priv)
  if (priv) {
    const pshell = await connect(priv.find((x) => x.url.includes('private=1')))
    const prpc = (m, ...a) => pshell.eval(`window.f2pxShell.rpc(${JSON.stringify(m)}, ...${JSON.stringify(a)})`)
    const ps = await prpc('shell.state')
    check('J2. private window state is flagged private', ps.isPrivate === true)
    await prpc('nav.go', 'http://127.0.0.1:8899/private-only-page')
    await sleep(1500)
    const beforeCount = (await hist2(PORT)).length
    check('J3. private visit is NOT written to history', !(await hist2(PORT)).some((e) => e.url.includes('private-only-page')), String(beforeCount))
    pshell.close()
  }
} catch (e) {
  check('unexpected error', false, e.stack)
} finally {
  summary()
  try { shell?.close() } catch {}
  await browserClose(PORT).catch(() => {})
  server.close()
  if (!app.child.killed) app.child.kill()
  console.log('\n--- app log tail ---\n' + app.log().split('\n').slice(-15).join('\n'))
  process.exit(process.exitCode || 0)
}

async function hist2(port) {
  const tg = (await targets()).find((x) => x.url.startsWith('f2px://history'))
  const c = await connect(tg)
  const r = await c.eval(`window.f2px.rpc('history.list', {})`)
  c.close()
  return r
}

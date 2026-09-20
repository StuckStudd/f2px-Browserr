// Regenerates website/assets/shots/*.png from the real app (needs `npm run build` first).
//   node scripts/capture-site-screenshots.mjs
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { launch, shellConn, waitFor, sleep, targets, connect, browserClose, killAll, TMP, PROJECT } from '../tests/helpers/harness.mjs'

const PORT = 9380
const OUT = path.join(PROJECT, 'website', 'assets', 'shots')
fs.mkdirSync(OUT, { recursive: true })
const userData = path.join(TMP, 'ud-shots')
const saveDir = path.join(TMP, 'shots-downloads')
fs.rmSync(userData, { recursive: true, force: true })
fs.rmSync(saveDir, { recursive: true, force: true })

// Local server that serves realistic-looking downloads.
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/news')) {
    // a page full of third-party trackers (host names are mapped to this server below)
    res.writeHead(200, { 'Content-Type': 'text/html' })
    return res.end(`<title>News</title>${['doubleclick.net', 'b.scorecardresearch.com', 'ib.adnxs.com', 'static.criteo.net'].map((h) => `<img src="http://${h}:8898/px.gif">`).join('')}`)
  }
  if (req.url === '/px.gif') return res.writeHead(200, { 'Content-Type': 'image/gif' }).end(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'))
  const files = { '/example.zip': [16_000_000, 50_000, 50], '/photo.png': [2_100_000, 700_000, 5], '/report-2026.pdf': [940_000, 400_000, 5] }
  const entry = files[req.url]
  if (!entry) return res.writeHead(404).end()
  const [total, chunkSize, every] = entry
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': total, 'Content-Disposition': `attachment; filename="${req.url.slice(1)}"` })
  let sent = 0
  const timer = setInterval(() => {
    if (sent >= total) { clearInterval(timer); return res.end() }
    res.write(Buffer.alloc(Math.min(chunkSize, total - sent), 1)); sent += chunkSize
  }, every)
  res.on('close', () => clearInterval(timer))
})
await new Promise((r) => server.listen(8898, '127.0.0.1', r))

const app = launch(userData, PORT, undefined, ['--host-resolver-rules=MAP doubleclick.net 127.0.0.1,MAP b.scorecardresearch.com 127.0.0.1,MAP ib.adnxs.com 127.0.0.1,MAP static.criteo.net 127.0.0.1'])
const shell = await waitFor(async () => shellConn(), 25000, 500)
const rpc = (m, ...a) => shell.eval(`window.f2pxShell.rpc(${JSON.stringify(m)}, ...${JSON.stringify(a)})`)
await waitFor(async () => (await rpc('shell.state')).tabs.length)
await rpc('settings.update', { downloadMode: 'custom', downloadPath: saveDir, userName: '', showGreeting: true })

// bookmarks with a folder
const dev = await rpc('bookmarks.folder', 'Dev')
const read = await rpc('bookmarks.folder', 'Reading')
for (const [title, url, parentId] of [
  ['GitHub', 'https://github.com/', null], ['Wikipedia', 'https://www.wikipedia.org/', null], ['Hacker News', 'https://news.ycombinator.com/', null],
  ['MDN Web Docs', 'https://developer.mozilla.org/', dev.id], ['TypeScript', 'https://www.typescriptlang.org/', dev.id], ['Electron', 'https://www.electronjs.org/', dev.id],
  ['The Verge', 'https://www.theverge.com/', read.id], ['Ars Technica', 'https://arstechnica.com/', read.id]
]) await rpc('bookmarks.add', { title, url, parentId })

// a few real blocked trackers so the privacy counter is not empty
for (let i = 0; i < 4; i++) {
  await rpc('nav.go', 'http://127.0.0.1:8898/news?' + i)
  await sleep(1300)
}

// downloads: two finished, one in progress
await rpc('nav.go', 'http://127.0.0.1:8898/photo.png')
await sleep(1500)
await rpc('nav.go', 'http://127.0.0.1:8898/report-2026.pdf')
await sleep(1500)
await rpc('nav.go', 'http://127.0.0.1:8898/example.zip')
await sleep(6500)

async function shoot(page, name, scrollTo) {
  await rpc('ui.openPage', page)
  const t = await waitFor(async () => (await targets()).find((x) => x.url.startsWith(`f2px://${page}`)), 15000)
  const c = await connect(t)
  await c.send('Page.enable')
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 760, deviceScaleFactor: 1.5, mobile: false })
  await sleep(1200)
  if (scrollTo) {
    await c.eval(`document.querySelector(${JSON.stringify(scrollTo)}).scrollIntoView()`)
    await sleep(600)
  }
  // Public screenshots must not show the real profile path.
  await c.eval(`(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeValue.includes('shots-downloads')) n.nodeValue = n.nodeValue.replace(/^.*shots-downloads/, 'C:\\\\Users\\\\user\\\\Downloads\\\\F2PX');
    }
  })()`)
  await sleep(150)
  await c.shot(path.join(OUT, `${name}.png`))
  await c.send('Emulation.clearDeviceMetricsOverride')
  c.close()
  console.log('captured', name)
}

await shoot('downloads', 'downloads')
await shoot('bookmarks', 'bookmarks')
await shoot('settings', 'settings')
await shoot('settings', 'privacy', '#sec-privacy')
// first-run wizard, search step (DuckDuckGo recommended)
await rpc('ui.openPage', 'welcome')
{
  const t = await waitFor(async () => (await targets()).find((x) => x.url.startsWith('f2px://welcome')), 15000)
  const c = await connect(t)
  await c.send('Page.enable')
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 760, deviceScaleFactor: 1.5, mobile: false })
  await sleep(1000)
  const next = `[...document.querySelectorAll('.welcome__nav .btn')].find((b) => /get started|continue/i.test(b.textContent)).click()`
  for (let i = 0; i < 3; i++) { await c.eval(next); await sleep(450) }
  await sleep(500)
  await c.shot(path.join(OUT, 'setup.png'))
  await c.send('Emulation.clearDeviceMetricsOverride')
  c.close()
  console.log('captured setup')
}
// home last: the "new tab" page
await rpc('tabs.create')
await sleep(1500)
const home = (await targets()).filter((x) => x.url.startsWith('f2px://home')).pop()
const hc = await connect(home)
await hc.send('Page.enable')
await hc.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 760, deviceScaleFactor: 1.5, mobile: false })
await sleep(1500)
await hc.shot(path.join(OUT, 'home.png'))
console.log('captured home')
hc.close()

shell.close()
await browserClose(PORT).catch(() => {})
server.close()
killAll()
fs.rmSync(saveDir, { recursive: true, force: true })
process.exit(0)

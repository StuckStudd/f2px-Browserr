// Proves the privacy claim "F2PX makes no network requests on its own":
// the browser runs behind a logging proxy for a while, doing nothing but showing its own pages.
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { launch, shellConn, waitFor, check, summary, sleep, targets, connect, browserClose, killAll, TMP } from '../helpers/harness.mjs'

const PORT = 9354
const PROXY_PORT = 8897
const userData = path.join(TMP, 'ud-e2e-traffic')
fs.rmSync(userData, { recursive: true, force: true })

const seen = []
const proxy = http.createServer((req, res) => {
  seen.push(`HTTP ${req.headers.host}${req.url}`.slice(0, 120))
  res.writeHead(502).end('blocked by test proxy')
})
proxy.on('connect', (req, socket) => {
  seen.push(`CONNECT ${req.url}`)
  socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
})
await new Promise((r) => proxy.listen(PROXY_PORT, '127.0.0.1', r))

const app = launch(userData, PORT, undefined, [`--proxy-server=127.0.0.1:${PROXY_PORT}`])
let shell
try {
  shell = await waitFor(async () => shellConn(), 25000, 500)
  const rpc = (m, ...a) => shell.eval(`window.f2pxShell.rpc(${JSON.stringify(m)}, ...${JSON.stringify(a)})`)
  await waitFor(async () => (await rpc('shell.state')).tabs.length)
  await sleep(2000)

  // idle on the start page, then visit every built-in page
  for (const page of ['history', 'downloads', 'bookmarks', 'settings']) {
    await rpc('ui.openPage', page)
    await sleep(1200)
  }
  await rpc('tabs.create')
  await sleep(1500)
  await rpc('omnibox.suggest', 'test')
  const suggestions = await rpc('omnibox.remote', 'test') // default: suggestions off -> must not hit the network
  check('search suggestions are off by default and send nothing', suggestions.length === 0)
  await sleep(20000) // long idle: background services (update checks, telemetry, sync, ...) would show up here

  check('no network request in 30 s of startup + idle + built-in pages', seen.length === 0, seen.join(' | ') || '(none)')

  // sanity: the proxy really sees traffic when the user navigates somewhere
  await rpc('nav.go', 'http://example.org/')
  await waitFor(async () => seen.length > 0, 15000, 300)
  check('sanity: user-initiated navigation does reach the network (the check above was meaningful)', seen.some((s) => /example\.org/.test(s)), seen.join(' | '))
} catch (e) {
  check('unexpected error', false, e.stack)
} finally {
  summary()
  try { shell?.close() } catch {}
  await browserClose(PORT).catch(() => {})
  proxy.close()
  killAll()
  process.exit(process.exitCode || 0)
}

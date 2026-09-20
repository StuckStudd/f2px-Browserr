// Network routes: custom proxy, Tor mode with fail-closed behaviour, Tor windows, and main-process requests.
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { launch, shellConn, waitFor, check, summary, sleep, targets, connect, browserClose, killAll, mainProcess, isShell, TMP } from '../helpers/harness.mjs'

const PORT = 9373
const INSPECT = 9256
const SOCKS_PORT = 19155
const userData = path.join(TMP, 'ud-e2e-network')
fs.rmSync(userData, { recursive: true, force: true })

// ── the "internet": one local web server; every host name resolves to it, but only *through the proxy*
const hits = []
const web = http.createServer((req, res) => {
  hits.push({ host: (req.headers.host || '').split(':')[0], url: req.url })
  if (req.url.startsWith('/favicon.ico')) {
    res.writeHead(200, { 'Content-Type': 'image/x-icon' })
    return res.end(Buffer.from('AAABAAEAAQEAAAEAIAAwAAAAFgAAACgAAAABAAAAAgAAAAEAIAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAD///8A', 'base64'))
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(`<!doctype html><title>Reached ${req.headers.host}</title>reached`)
})
await new Promise((r) => web.listen(8899, '127.0.0.1', r))

// ── a minimal SOCKS5 proxy that logs what the browser asks for (domain names must arrive unresolved)
const socksLog = []
const socks = net.createServer((client) => {
  client.once('data', (greeting) => {
    if (greeting[0] !== 0x05) return client.destroy()
    client.write(Buffer.from([0x05, 0x00]))
    client.once('data', (req) => {
      const atyp = req[3]
      let host
      let offset
      if (atyp === 0x01) { host = [...req.subarray(4, 8)].join('.'); offset = 8 }
      else if (atyp === 0x03) { const len = req[4]; host = req.subarray(5, 5 + len).toString(); offset = 5 + len }
      else { host = 'ipv6'; offset = 20 }
      const port = req.readUInt16BE(offset)
      socksLog.push({ atyp, host, port })
      // the "exit node": anything goes to the local web server
      const upstream = net.connect(8899, '127.0.0.1', () => {
        client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0, 0]))
        client.pipe(upstream)
        upstream.pipe(client)
      })
      upstream.on('error', () => client.destroy())
      client.on('error', () => upstream.destroy())
    })
  })
  client.on('error', () => undefined)
})
await new Promise((r) => socks.listen(SOCKS_PORT, '127.0.0.1', r))

const rules = '--host-resolver-rules=MAP direct-host.test 127.0.0.1'
const app = launch(userData, PORT, INSPECT, [rules])
let main
const rpcOf = (sh) => (m, ...a) => sh.eval(`window.f2pxShell.rpc(${JSON.stringify(m)}, ...${JSON.stringify(a)})`)

try {
  let shell = await waitFor(async () => shellConn(), 25000, 500)
  main = await mainProcess(INSPECT)
  let rpc = rpcOf(shell)
  await waitFor(async () => (await rpc('shell.state')).tabs.length)
  await rpc('settings.update', { httpsOnly: false })
  const activeTab = async (r = rpc) => { const s = await r('shell.state'); return s.tabs.find((t) => t.id === s.activeId) }
  const go = async (url, r = rpc) => {
    await r('nav.go', url)
    return waitFor(async () => { const t = await activeTab(r); return t.url.startsWith(url.replace(/\/$/, '')) || t.url.startsWith('f2px://error') ? (t.loading ? null : t) : null }, 20000)
  }

  // ── direct by default
  const direct = await go('http://direct-host.test:8899/')
  check('direct: a page loads without any proxy', direct?.title === 'Reached direct-host.test:8899', direct?.title)
  check('direct: nothing went through the proxy', socksLog.length === 0)
  const status0 = await rpc('net.status')
  check('net.status describes the default route', status0.route === 'system' && status0.mode === 'system', JSON.stringify(status0))

  // ── validation of proxy settings
  await rpc('settings.update', { proxyUrl: 'javascript:alert(1)', torProxyUrl: 'http://evil', torPath: 'C:\\x"y' })
  const s1 = await rpc('settings.get')
  check('settings: malformed proxy addresses are rejected', s1.proxyUrl === '' && s1.torProxyUrl === '' && s1.torPath === '', JSON.stringify([s1.proxyUrl, s1.torProxyUrl, s1.torPath]))

  // ── custom SOCKS5 proxy: the name reaches the proxy unresolved
  await rpc('settings.update', { proxyMode: 'custom', proxyUrl: `socks5://127.0.0.1:${SOCKS_PORT}` })
  await sleep(600)
  hits.length = 0
  const viaProxy = await go('http://proxied-host.example:8899/')
  check('proxy: the page loads through the SOCKS5 proxy', viaProxy?.title === 'Reached proxied-host.example:8899', viaProxy?.title)
  const entry = socksLog.find((e) => e.host === 'proxied-host.example')
  check('proxy: the host NAME is handed to the proxy — no local DNS lookup (no DNS leak)', entry?.atyp === 0x03 && entry.port === 8899, JSON.stringify(entry))
  check('proxy: status reports it', (await rpc('net.status')).route === 'custom')

  // main-process requests (site icons) follow the route too
  socksLog.length = 0
  const icon = await rpc('favicons.data', 'http://icons.example:8899/favicon.ico')
  check('main-process requests (icons) go through the proxy as well', socksLog.some((e) => e.host === 'icons.example'), JSON.stringify(socksLog))
  check('icons arrive as data URLs (the interface never loads remote images itself)', typeof icon === 'string' && icon.startsWith('data:image/'), String(icon).slice(0, 40))

  // ── an empty custom proxy never means "direct"
  await rpc('settings.update', { proxyMode: 'custom', proxyUrl: '' })
  await sleep(500)
  hits.length = 0
  const empty = await go('http://direct-host.test:8899/?empty')
  check('proxy without an address fails closed (nothing is sent directly)', empty?.url.startsWith('f2px://error') && hits.length === 0, `${empty?.url} hits=${hits.length}`)

  // ── Tor mode: fail closed when no Tor is reachable
  await rpc('settings.update', { proxyMode: 'tor', torProxyUrl: 'socks5://127.0.0.1:19999' })
  await sleep(700)
  hits.length = 0
  const noTor = await go('http://direct-host.test:8899/?notor')
  check('tor mode without a Tor client: the page does not load and shows the proxy error', noTor?.url.startsWith('f2px://error') && /type=proxy/.test(noTor.url), noTor?.url)
  check('tor mode without a Tor client: nothing reached the server directly', hits.length === 0, JSON.stringify(hits))
  const st = await rpc('net.status')
  check('net.status shows Tor as required but not reachable', st.route === 'tor' && st.tor.reachable === false, JSON.stringify(st))

  // ── Tor mode with a reachable "Tor"
  await rpc('settings.update', { torProxyUrl: `socks5://127.0.0.1:${SOCKS_PORT}` })
  await sleep(700)
  socksLog.length = 0
  const torPage = await go('http://tor-site.example:8899/')
  check('tor mode: pages load through the Tor proxy, hostnames unresolved', torPage?.title === 'Reached tor-site.example:8899' && socksLog.some((e) => e.host === 'tor-site.example' && e.atyp === 0x03), `${torPage?.title} ${JSON.stringify(socksLog)}`)
  const st2 = await rpc('net.status')
  check('net.status shows Tor reachable', st2.route === 'tor' && st2.tor.reachable === true, JSON.stringify(st2))

  // ── back to direct; a Tor window still goes through Tor
  await rpc('settings.update', { proxyMode: 'system' })
  await sleep(700)
  await rpc('ui.newTorWindow')
  const torShell = await waitFor(async () => {
    for (let i = 0; i < 4; i++) {
      const list = (await targets()).filter(isShell)
      if (!list[i]) break
      const c = await connect(list[i])
      const r = rpcOf(c)
      const s = await r('shell.state').catch(() => null)
      if (s?.isTor) return { c, r }
      c.close()
    }
    return null
  }, 15000, 500)
  check('a Tor window opens', !!torShell)
  if (torShell) {
    socksLog.length = 0
    const inTor = await go('http://tor-window.example:8899/', torShell.r)
    check('tor window: traffic goes through the Tor proxy (even though the main route is direct)', inTor?.title === 'Reached tor-window.example:8899' && socksLog.some((e) => e.host === 'tor-window.example'), `${inTor?.title} ${JSON.stringify(socksLog)}`)
    const flags = JSON.parse(await main.eval(`(() => { const { webContents } = process.mainModule.require('electron'); const w = webContents.getAllWebContents().find((x) => x.getURL().startsWith('http://tor-window.example')); return JSON.stringify({ webrtc: w.getWebRTCIPHandlingPolicy() }) })()`))
    check('tor window: WebRTC cannot use direct connections', flags.webrtc === 'disable_non_proxied_udp', JSON.stringify(flags))
    const before = hits.length
    const back = await go('http://direct-host.test:8899/?back')
    check('the normal window is unaffected by the Tor window (still direct)', back?.title === 'Reached direct-host.test:8899' && hits.length > before, back?.title)
    const state = await torShell.r('shell.state')
    check('tor window is private (its own in-memory session)', state.isPrivate === true && state.isTor === true)
    const fpCanvasCheck = await torShell.r('settings.get')
    check('tor window: the settings of the normal window are not changed', fpCanvasCheck.fingerprintProtection === 'standard')
    torShell.c.close()
  }
} catch (error) {
  check('e2e run completed without an exception', false, error?.stack || String(error))
} finally {
  summary()
  try { main?.close() } catch {}
  try { await browserClose(PORT) } catch {}
  killAll()
  web.close()
  socks.close()
  process.exit(process.exitCode ?? 0)
}

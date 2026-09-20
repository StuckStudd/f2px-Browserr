import * as cp from 'node:child_process'
const { spawn } = cp
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { targets, connect, find, isShell, isInternal } from './cdp.mjs'

export const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const TMP = path.join(PROJECT, 'tests', '.tmp')
fs.mkdirSync(TMP, { recursive: true })
export const NET = process.env.F2PX_E2E_NETWORK !== '0'
export const downloadsDir = path.join(os.homedir(), 'Downloads', 'F2PX')
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let passed = 0
let failed = 0
export function check(name, ok, extra = '') {
  if (ok) passed++
  else failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`)
}
export const summary = () => {
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exitCode = failed > 0 ? 1 : 0
}
/** Like check(), but skipped when F2PX_E2E_NETWORK=0. */
export function checkNet(name, ok, extra = '') {
  if (!NET) return console.log(`SKIP  ${name} (network disabled)`)
  check(name, ok, extra)
}

export async function waitFor(fn, timeout = 15000, step = 200) {
  const t0 = Date.now()
  let last
  while (Date.now() - t0 < timeout) {
    try {
      last = await fn()
      if (last) return last
    } catch {
      /* retry */
    }
    await sleep(step)
  }
  return last || null
}

export function launchExe(exe, userData, port) {
  process.env.PORT = String(port)
  const env = { ...process.env, F2PX_USER_DATA: userData, F2PX_DEBUG_PORT: String(port), F2PX_SKIP_ONBOARDING: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(exe, [], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  child.stdout.on('data', (d) => (log += d))
  child.stderr.on('data', (d) => (log += d))
  return { child, log: () => log }
}

export function launch(userData, port, inspectPort, extraArgs = [], extraEnv = {}) {
  process.env.PORT = String(port)
  // Tests skip the first-run wizard unless they explicitly pass F2PX_SKIP_ONBOARDING: ''.
  const env = { ...process.env, F2PX_USER_DATA: userData, F2PX_DEBUG_PORT: String(port), F2PX_SKIP_ONBOARDING: '1', ...extraEnv }
  delete env.ELECTRON_RUN_AS_NODE
  const args = ['scripts/run.cjs', 'electron', '.']
  if (inspectPort) args.push(`--inspect=${inspectPort}`)
  args.push(...extraArgs)
  const child = spawn('node', args, { cwd: PROJECT, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  child.stdout.on('data', (d) => (log += d))
  child.stderr.on('data', (d) => (log += d))
  return { child, log: () => log }
}

export async function shellConn(index = 0) {
  const all = (await targets()).filter(isShell)
  return connect(all[index])
}

export function killAll() {
  // kill every electron.exe that belongs to THIS project (never touches other Electron apps)
  const electronExe = path.join(PROJECT, 'node_modules', 'electron', 'dist', 'electron.exe').replace(/'/g, "''")
  try {
    cp.execFileSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq '${electronExe}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`])
  } catch {}
}

export async function browserClose(port) {
  const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
  const ws = new WebSocket(v.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }))
  await sleep(1500)
}

/** Local test site: normal page, small and slow downloads. */
export function startServer(port = 8899) {
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url.startsWith('/?')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<!doctype html><title>Local Test Page</title><h1>F2PX test</h1><a id=dl href="/small.bin">small</a>')
    } else if (req.url.startsWith('/pixel.gif')) {
      res.writeHead(200, { 'Content-Type': 'image/gif' })
      res.end(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'))
    } else if (req.url === '/trackers') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><title>Trackers</title>
        <img id=ads src="http://doubleclick.net:8899/pixel.gif?a">
        <img id=analytics src="http://b.scorecardresearch.com:8899/pixel.gif?b">
        <img id=social src="http://platform.twitter.com:8899/pixel.gif?c">
        <img id=plain src="http://cdn.example.test:8899/pixel.gif?d">`)
    } else if (req.url === '/links') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><title>Links</title><body style="margin:0;background:#fff">
        <a id=a href="/private-marker?mid" style="position:absolute;left:20px;top:20px;width:300px;height:80px;display:block;background:#ddd">middle</a>
        <a id=b target=_blank href="/private-marker?blank" style="position:absolute;left:20px;top:120px;width:300px;height:80px;display:block;background:#bbb">blank</a>
        <button id=p style="position:absolute;left:20px;top:220px;width:300px;height:80px" onclick="window.__w = window.open('/private-marker?popup', 'pop', 'width=400,height=300')">popup</button>`)
    } else if (req.url.startsWith('/headers')) {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(JSON.stringify(req.headers))
    } else if (req.url === '/setcookie') {
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Set-Cookie': 'f2px=1; Max-Age=3600; Path=/' })
      res.end('cookie set')
    } else if (req.url.startsWith('/private-marker')) {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<title>Private Marker</title>secret')
    } else if (req.url.startsWith('/small.bin')) {
      const body = Buffer.alloc(200_000, 7)
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length, 'Content-Disposition': 'attachment; filename="f2px-small.bin"' })
      res.end(body)
    } else if (req.url.startsWith('/big')) {
      const total = 8_000_000
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': total,
        'Content-Disposition': `attachment; filename="f2px-${req.url.slice(1).split('?')[0]}"`
      })
      let sent = 0
      const chunk = Buffer.alloc(100_000, 1)
      const timer = setInterval(() => {
        if (sent >= total) {
          clearInterval(timer)
          return res.end()
        }
        res.write(chunk)
        sent += chunk.length
      }, 40)
      res.on('close', () => clearInterval(timer))
    } else {
      res.writeHead(404)
      res.end('nope')
    }
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)))
}

export { targets, connect, find, isShell, isInternal }

/** Evaluate JS inside the Electron *main* process through the Node inspector. */
export async function mainProcess(inspectPort) {
  const list = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${inspectPort}/json/list`)).json())[0], 15000, 300)
  const ws = new WebSocket(list.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  }
  const send = (method, params) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })) })
  return {
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description)
      return r.result?.result?.value
    },
    close: () => ws.close()
  }
}

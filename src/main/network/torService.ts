import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import type { NetStatus } from '../../shared/types'
import type { SettingsService } from '../settings/settingsService'
import { Emitter } from '../utils/emitter'
import { ensureDir } from '../utils/fsUtils'

/** Where a Tor client usually listens: Tor Browser, and a stand-alone tor / Tor Expert Bundle. */
const WELL_KNOWN = ['socks5://127.0.0.1:9150', 'socks5://127.0.0.1:9050']
/** Nothing listens here: requests fail at once instead of leaving the device when no Tor is available (the kill switch). */
export const DEAD_PROXY = 'socks5://127.0.0.1:9'
const POLL_MS = 4000

function endpointOf(proxyUrl: string): { host: string; port: number } | null {
  try {
    const u = new URL(proxyUrl)
    return { host: u.hostname.replace(/^\[|\]$/g, ''), port: Number(u.port) }
  } catch {
    return null
  }
}

/** Is something accepting TCP connections there? (Only ever the local machine or the address the user typed.) */
export function isReachable(proxyUrl: string, timeoutMs = 700): Promise<boolean> {
  const endpoint = endpointOf(proxyUrl)
  if (!endpoint || !endpoint.port) return Promise.resolve(false)
  return new Promise((resolve) => {
    const socket = net.connect({ host: endpoint.host, port: endpoint.port })
    const done = (ok: boolean): void => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo
      server.close(() => resolve(port))
    })
  })
}

/**
 * Finds — or, when the user pointed F2PX at tor.exe, runs — a Tor client. F2PX does not ship Tor: it talks SOCKS5 to one.
 * The proxy address is only ever a loopback or user-supplied address; nothing is downloaded here.
 */
export class TorService {
  readonly onChange = new Emitter<void>()
  private detected: string | null = null
  private managed: { child: ChildProcess; proxy: string; bootstrapped: boolean; percent: number } | null = null
  private error: string | null = null
  private timer: NodeJS.Timeout | undefined

  constructor(
    private readonly settings: SettingsService,
    private readonly dataDir: string
  ) {}

  /** The SOCKS proxy to use right now, or null when there is none (callers then fail closed). */
  proxy(): string | null {
    const s = this.settings.get()
    if (s.torProxyUrl) return s.torProxyUrl
    if (this.managed) return this.managed.proxy
    return this.detected
  }

  /** Called whenever something (a window, the global mode) needs Tor. Starts the managed client / polling. */
  require(): void {
    void this.ensureManaged()
    this.startPolling()
    void this.refresh()
  }

  /** Nothing needs Tor any more: stop polling and shut down the client F2PX started (Tor Browser is never touched). */
  release(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    const child = this.managed?.child
    this.managed = null
    if (child && !child.killed) child.kill()
  }

  private startPolling(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.refresh(), POLL_MS)
    this.timer.unref()
  }

  /** Re-probes the well-known ports; emits a change when the answer differs. */
  async refresh(): Promise<void> {
    const before = this.proxy()
    const s = this.settings.get()
    if (!s.torProxyUrl && !this.managed) {
      let found: string | null = null
      for (const candidate of WELL_KNOWN) {
        if (await isReachable(candidate)) {
          found = candidate
          break
        }
      }
      this.detected = found
    }
    if (this.proxy() !== before) this.onChange.emit()
  }

  private async ensureManaged(): Promise<void> {
    const s = this.settings.get()
    if (this.managed || !s.torPath) return
    try {
      const exe = path.resolve(s.torPath)
      if (!fs.existsSync(exe) || !/(^|[\\/])tor(\.exe)?$/i.test(exe)) throw new Error('The Tor program was not found at the path you set')
      const port = await freePort()
      const proxy = `socks5://127.0.0.1:${port}`
      const dir = path.join(this.dataDir, 'tor-data')
      ensureDir(dir)
      const child = spawn(
        exe,
        ['--SocksPort', `127.0.0.1:${port}`, '--DataDirectory', dir, '--ClientOnly', '1', '--Log', 'notice stdout', '--AvoidDiskWrites', '1'],
        { cwd: path.dirname(exe), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
      )
      this.managed = { child, proxy, bootstrapped: false, percent: 0 }
      this.error = null
      let buffer = ''
      child.stdout?.on('data', (chunk: Buffer) => {
        buffer = (buffer + chunk.toString('utf8')).slice(-2000)
        const all = [...buffer.matchAll(/Bootstrapped (\d+)%/g)]
        const last = all[all.length - 1]
        if (last && this.managed) {
          this.managed.percent = Number(last[1])
          const done = this.managed.percent >= 100
          if (done !== this.managed.bootstrapped) {
            this.managed.bootstrapped = done
            this.onChange.emit()
          }
        }
      })
      child.once('error', (e) => this.failed(e.message))
      child.once('exit', (code) => {
        if (this.managed?.child === child) {
          this.managed = null
          if (code) this.failed(`Tor stopped (exit code ${code})`)
          else this.onChange.emit()
        }
      })
      this.onChange.emit()
    } catch (error) {
      this.failed(error instanceof Error ? error.message : 'Could not start Tor')
    }
  }

  private failed(message: string): void {
    this.error = message
    this.managed = null
    this.onChange.emit()
  }

  stop(): void {
    this.release()
  }

  async status(): Promise<NetStatus['tor']> {
    const proxy = this.proxy()
    const reachable = proxy ? await isReachable(proxy) : false
    return {
      reachable,
      managed: !!this.settings.get().torPath,
      running: !!this.managed,
      proxy: proxy ?? '',
      error: this.error
    }
  }
}

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { net, protocol, type Session } from 'electron'
import { INTERNAL_PAGES, INTERNAL_SCHEME } from '../../shared/url'
import { paths } from '../paths'

/** Must run before `app.ready`. */
export function registerInternalScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: INTERNAL_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }
  ])
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

const BASE_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff'
}

const isDev = (): string | undefined => process.env['ELECTRON_RENDERER_URL']

async function serveFile(file: string): Promise<Response> {
  try {
    const body = await readFile(file)
    const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
    return new Response(new Uint8Array(body), { headers: { ...BASE_HEADERS, 'Content-Type': type } })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

/** Resolves `child` inside `root`, refusing anything that escapes it (path traversal). */
function safeJoin(root: string, child: string): string | null {
  const resolved = path.resolve(root, `.${path.posix.normalize(`/${child}`)}`)
  return resolved.startsWith(path.resolve(root) + path.sep) ? resolved : null
}

/**
 * Serves internal pages:
 *   f2px://<page>/            -> internal.html (the React app picks the page from the hostname)
 *   f2px://<page>/assets/...  -> bundled assets
 *   f2px://userdata/<file>    -> user-chosen start-page backgrounds
 */
export function registerInternalProtocol(ses: Session): void {
  ses.protocol.handle(INTERNAL_SCHEME, async (request) => {
    let url: URL
    try {
      url = new URL(request.url)
    } catch {
      return new Response('Bad request', { status: 400 })
    }

    if (url.hostname === 'userdata') {
      const name = decodeURIComponent(url.pathname.slice(1))
      const file = /^[\w.-]{1,120}$/.test(name) ? safeJoin(paths.backgrounds(), name) : null
      return file ? serveFile(file) : new Response('Not found', { status: 404 })
    }

    const isPage = url.hostname === 'newtab' || (INTERNAL_PAGES as readonly string[]).includes(url.hostname)
    if (!isPage) return new Response('Not found', { status: 404 })

    const requested = decodeURIComponent(url.pathname)
    const isDocument = requested === '/' || requested === ''

    const devServer = isDev()
    if (devServer) {
      const target = isDocument ? `${devServer}/internal.html` : `${devServer}${requested}${url.search}`
      try {
        return await net.fetch(target)
      } catch {
        return new Response('Dev server unavailable', { status: 502 })
      }
    }

    if (isDocument) return serveFile(path.join(paths.rendererRoot(), 'internal.html'))
    const file = safeJoin(paths.rendererRoot(), requested)
    return file ? serveFile(file) : new Response('Not found', { status: 404 })
  })
}

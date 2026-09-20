import { contextBridge, ipcRenderer, webFrame } from 'electron'
import { shieldMain } from './shieldMain'

/**
 * Registered as a session preload for every tab session, so it runs at the start of *every* frame — the page itself,
 * cross-site iframes, and blank frames a script creates to get at unpatched browser functions.
 * It asks the main process what the shield should do for this site, then applies it in the page's own JS world.
 */
interface ShieldReply {
  level: 'off' | 'standard' | 'strict'
  seed: string
  stripReferrer: boolean
  blockCookies: boolean
  css: string
}

interface PageGlobals {
  location: { protocol: string; hostname: string; origin: string; ancestorOrigins?: ArrayLike<string> }
  window: object & { top: unknown }
}
const page = globalThis as unknown as PageGlobals
const loc = page.location
const skip = loc.protocol === 'f2px:' || loc.protocol === 'devtools:' || loc.protocol === 'chrome-error:' || loc.protocol === 'chrome:'

if (!skip) {
  try {
    const ancestors = loc.ancestorOrigins
    const topOrigin = ancestors && ancestors.length > 0 ? ancestors[ancestors.length - 1] : loc.origin
    const reply = ipcRenderer.sendSync('f2px:shield-config', {
      host: loc.hostname,
      topOrigin,
      isTop: page.window === page.window.top
    }) as ShieldReply | null

    if (reply) {
      if (reply.level !== 'off' || reply.blockCookies) {
        contextBridge.executeInMainWorld({
          func: shieldMain,
          args: [
            { level: reply.level, seed: reply.seed, stripReferrer: reply.stripReferrer, blockCookies: reply.blockCookies },
            (kind: string) => ipcRenderer.send('f2px:shield-hit', String(kind).slice(0, 12))
          ]
        })
      }
      if (reply.css) webFrame.insertCSS(reply.css)
    }
  } catch {
    /* a failing shield must never break the page */
  }
}

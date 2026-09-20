import { dialog, shell, type BrowserWindow } from 'electron'

/** Schemes a page may hand over to another application, after the user agrees. */
const HANDOFF_SCHEMES = new Set(['mailto:', 'tel:'])

export type NavigationVerdict = 'allow' | 'block' | 'external'

/**
 * Decides what to do with a navigation target requested by page content.
 * `fromInternal` is true when the requesting page is one of our own f2px:// pages.
 */
export function classifyNavigation(target: string, fromInternal: boolean): NavigationVerdict {
  let protocol: string
  try {
    protocol = new URL(target).protocol
  } catch {
    return 'block'
  }
  if (protocol === 'http:' || protocol === 'https:' || protocol === 'blob:' || protocol === 'about:') return 'allow'
  if (protocol === 'f2px:' || protocol === 'file:') return fromInternal ? 'allow' : 'block'
  if (HANDOFF_SCHEMES.has(protocol)) return 'external'
  return 'block'
}

export async function openExternalWithConsent(url: string, parent?: BrowserWindow): Promise<void> {
  let label: string
  try {
    const u = new URL(url)
    if (!HANDOFF_SCHEMES.has(u.protocol)) return
    label = u.protocol === 'mailto:' ? 'your email app' : 'a phone app'
  } catch {
    return
  }
  const options = {
    type: 'question' as const,
    buttons: ['Cancel', 'Open'],
    defaultId: 0,
    cancelId: 0,
    title: 'Open external link',
    message: `This page wants to open ${label}.`,
    detail: url.slice(0, 200)
  }
  const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
  if (response === 1) await shell.openExternal(url)
}

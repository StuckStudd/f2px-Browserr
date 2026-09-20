import { clipboard, type ContextMenuParams } from 'electron'
import { SEARCH_ENGINES } from '../../shared/settings'
import type { OverlayMenuItem, SearchEngineId } from '../../shared/types'
import { isWebUrl } from '../../shared/url'
import type { Tab } from './tab'

export interface BuiltMenu {
  items: OverlayMenuItem[]
  actions: Map<string, () => void>
}

interface MenuContext {
  tab: Tab
  params: ContextMenuParams
  searchEngine: SearchEngineId
  openTab: (url: string, background: boolean) => void
  runHistory: (action: 'back' | 'forward' | 'reload' | 'print') => void
}

/** Builds the right-click menu for web content. Rendered by the shell in the F2PX style. */
export function buildPageMenu(ctx: MenuContext): BuiltMenu {
  const { tab, params } = ctx
  const wc = tab.contents
  const items: OverlayMenuItem[] = []
  const actions = new Map<string, () => void>()
  const add = (id: string, label: string, run: () => void, extra: Partial<OverlayMenuItem> = {}): void => {
    items.push({ id, label, ...extra })
    actions.set(id, run)
  }
  const separator = (): void => {
    if (items.length > 0 && !items[items.length - 1].separator) items.push({ id: `sep-${items.length}`, label: '', separator: true })
  }

  if (params.linkURL && isWebUrl(params.linkURL)) {
    add('link-tab', 'Open link in new tab', () => ctx.openTab(params.linkURL, false))
    add('link-bg', 'Open link in background tab', () => ctx.openTab(params.linkURL, true))
    add('link-copy', 'Copy link address', () => clipboard.writeText(params.linkURL))
    separator()
  }

  if (params.mediaType === 'image' && params.srcURL) {
    if (isWebUrl(params.srcURL)) add('img-tab', 'Open image in new tab', () => ctx.openTab(params.srcURL, false))
    add('img-save', 'Save image as…', () => wc.downloadURL(params.srcURL))
    add('img-copy', 'Copy image', () => wc.copyImageAt(params.x, params.y))
    add('img-url', 'Copy image address', () => clipboard.writeText(params.srcURL))
    separator()
  } else if ((params.mediaType === 'video' || params.mediaType === 'audio') && params.srcURL && isWebUrl(params.srcURL)) {
    add('media-save', 'Save media as…', () => wc.downloadURL(params.srcURL))
    add('media-url', 'Copy media address', () => clipboard.writeText(params.srcURL))
    separator()
  }

  if (params.isEditable) {
    const f = params.editFlags
    add('undo', 'Undo', () => wc.undo(), { disabled: !f.canUndo, shortcut: 'Ctrl+Z' })
    add('redo', 'Redo', () => wc.redo(), { disabled: !f.canRedo, shortcut: 'Ctrl+Y' })
    separator()
    add('cut', 'Cut', () => wc.cut(), { disabled: !f.canCut, shortcut: 'Ctrl+X' })
    add('copy', 'Copy', () => wc.copy(), { disabled: !f.canCopy, shortcut: 'Ctrl+C' })
    add('paste', 'Paste', () => wc.paste(), { disabled: !f.canPaste, shortcut: 'Ctrl+V' })
    add('selectall', 'Select all', () => wc.selectAll(), { shortcut: 'Ctrl+A' })
    separator()
  } else if (params.selectionText.trim()) {
    const text = params.selectionText.trim()
    const short = text.length > 24 ? `${text.slice(0, 24)}…` : text
    add('copy', 'Copy', () => wc.copy(), { shortcut: 'Ctrl+C' })
    add('search', `Search ${SEARCH_ENGINES[ctx.searchEngine].name} for “${short}”`, () =>
      ctx.openTab(SEARCH_ENGINES[ctx.searchEngine].searchUrl.replace('%s', encodeURIComponent(text.slice(0, 300))), false)
    )
    separator()
  }

  if (!params.linkURL && !params.isEditable && !params.selectionText.trim()) {
    const nav = tab.info()
    add('back', 'Back', () => ctx.runHistory('back'), { disabled: !nav.canGoBack, shortcut: 'Alt+←' })
    add('forward', 'Forward', () => ctx.runHistory('forward'), { disabled: !nav.canGoForward, shortcut: 'Alt+→' })
    add('reload', 'Reload', () => ctx.runHistory('reload'), { shortcut: 'Ctrl+R' })
    separator()
    add('print', 'Print…', () => ctx.runHistory('print'), { shortcut: 'Ctrl+P' })
    separator()
  }

  add('inspect', 'Inspect element', () => {
    wc.inspectElement(params.x, params.y)
    if (wc.isDevToolsOpened()) wc.devToolsWebContents?.focus()
  })

  return { items, actions }
}

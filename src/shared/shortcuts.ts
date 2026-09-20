export type ShortcutAction =
  | 'newTab'
  | 'closeTab'
  | 'reopenTab'
  | 'focusAddress'
  | 'bookmark'
  | 'history'
  | 'downloads'
  | 'bookmarksPage'
  | 'toggleBookmarksBar'
  | 'settings'
  | 'reload'
  | 'hardReload'
  | 'nextTab'
  | 'prevTab'
  | 'newWindow'
  | 'privateWindow'
  | 'back'
  | 'forward'
  | 'home'
  | 'find'
  | 'devtools'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'fullscreen'
  | 'print'
  | 'tab1'
  | 'tab2'
  | 'tab3'
  | 'tab4'
  | 'tab5'
  | 'tab6'
  | 'tab7'
  | 'tab8'
  | 'lastTab'

export interface KeyMatch {
  /** Lower-cased `KeyboardEvent.key`. */
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
}

export interface ShortcutDef {
  action: ShortcutAction
  group: 'Tabs' | 'Navigation' | 'Pages' | 'Window' | 'Page'
  label: string
  /** Human readable, first entry is displayed in Settings. */
  display: string
  matches: KeyMatch[]
}

const c = (key: string, extra: Partial<KeyMatch> = {}): KeyMatch => ({ key, ctrl: true, ...extra })

export const SHORTCUTS: ShortcutDef[] = [
  { action: 'newTab', group: 'Tabs', label: 'New tab', display: 'Ctrl + T', matches: [c('t')] },
  { action: 'closeTab', group: 'Tabs', label: 'Close tab', display: 'Ctrl + W', matches: [c('w'), c('f4')] },
  { action: 'reopenTab', group: 'Tabs', label: 'Restore closed tab', display: 'Ctrl + Shift + T', matches: [c('t', { shift: true })] },
  { action: 'nextTab', group: 'Tabs', label: 'Next tab', display: 'Ctrl + Tab', matches: [c('tab'), c('pagedown')] },
  { action: 'prevTab', group: 'Tabs', label: 'Previous tab', display: 'Ctrl + Shift + Tab', matches: [c('tab', { shift: true }), c('pageup')] },
  { action: 'tab1', group: 'Tabs', label: 'Go to tab 1–8', display: 'Ctrl + 1…8', matches: [c('1')] },
  { action: 'tab2', group: 'Tabs', label: 'Go to tab 2', display: 'Ctrl + 2', matches: [c('2')] },
  { action: 'tab3', group: 'Tabs', label: 'Go to tab 3', display: 'Ctrl + 3', matches: [c('3')] },
  { action: 'tab4', group: 'Tabs', label: 'Go to tab 4', display: 'Ctrl + 4', matches: [c('4')] },
  { action: 'tab5', group: 'Tabs', label: 'Go to tab 5', display: 'Ctrl + 5', matches: [c('5')] },
  { action: 'tab6', group: 'Tabs', label: 'Go to tab 6', display: 'Ctrl + 6', matches: [c('6')] },
  { action: 'tab7', group: 'Tabs', label: 'Go to tab 7', display: 'Ctrl + 7', matches: [c('7')] },
  { action: 'tab8', group: 'Tabs', label: 'Go to tab 8', display: 'Ctrl + 8', matches: [c('8')] },
  { action: 'lastTab', group: 'Tabs', label: 'Go to last tab', display: 'Ctrl + 9', matches: [c('9')] },

  { action: 'focusAddress', group: 'Navigation', label: 'Address bar', display: 'Ctrl + L', matches: [c('l'), { key: 'f6' }, { key: 'd', alt: true }] },
  { action: 'back', group: 'Navigation', label: 'Back', display: 'Alt + ←', matches: [{ key: 'arrowleft', alt: true }] },
  { action: 'forward', group: 'Navigation', label: 'Forward', display: 'Alt + →', matches: [{ key: 'arrowright', alt: true }] },
  { action: 'home', group: 'Navigation', label: 'Home', display: 'Alt + Home', matches: [{ key: 'home', alt: true }] },
  { action: 'reload', group: 'Navigation', label: 'Reload', display: 'Ctrl + R', matches: [c('r'), { key: 'f5' }] },
  { action: 'hardReload', group: 'Navigation', label: 'Hard reload', display: 'Ctrl + Shift + R', matches: [c('r', { shift: true }), c('f5')] },

  { action: 'bookmark', group: 'Pages', label: 'Bookmark this page', display: 'Ctrl + D', matches: [c('d')] },
  { action: 'history', group: 'Pages', label: 'History', display: 'Ctrl + H', matches: [c('h')] },
  { action: 'downloads', group: 'Pages', label: 'Downloads', display: 'Ctrl + J', matches: [c('j')] },
  { action: 'bookmarksPage', group: 'Pages', label: 'Bookmark manager', display: 'Ctrl + Shift + O', matches: [c('o', { shift: true })] },
  { action: 'toggleBookmarksBar', group: 'Pages', label: 'Toggle bookmarks bar', display: 'Ctrl + Shift + B', matches: [c('b', { shift: true })] },
  { action: 'settings', group: 'Pages', label: 'Settings', display: 'Ctrl + ,', matches: [c(',')] },

  { action: 'newWindow', group: 'Window', label: 'New window', display: 'Ctrl + N', matches: [c('n')] },
  { action: 'privateWindow', group: 'Window', label: 'Private window', display: 'Ctrl + Shift + N', matches: [c('n', { shift: true })] },
  { action: 'fullscreen', group: 'Window', label: 'Full screen', display: 'F11', matches: [{ key: 'f11' }] },

  { action: 'find', group: 'Page', label: 'Find in page', display: 'Ctrl + F', matches: [c('f')] },
  { action: 'zoomIn', group: 'Page', label: 'Zoom in', display: 'Ctrl + +', matches: [c('='), c('+', { shift: true }), c('=', { shift: true })] },
  { action: 'zoomOut', group: 'Page', label: 'Zoom out', display: 'Ctrl + −', matches: [c('-'), c('_', { shift: true })] },
  { action: 'zoomReset', group: 'Page', label: 'Reset zoom', display: 'Ctrl + 0', matches: [c('0')] },
  { action: 'print', group: 'Page', label: 'Print', display: 'Ctrl + P', matches: [c('p')] },
  { action: 'devtools', group: 'Page', label: 'Developer tools', display: 'F12', matches: [{ key: 'f12' }, c('i', { shift: true })] }
]

export function matchShortcut(input: {
  key: string
  control: boolean
  shift: boolean
  alt: boolean
  meta: boolean
}): ShortcutAction | null {
  if (input.meta) return null
  const key = input.key.toLowerCase()
  for (const def of SHORTCUTS) {
    for (const m of def.matches) {
      if (m.key !== key) continue
      if (!!m.ctrl !== input.control) continue
      if (!!m.alt !== input.alt) continue
      if (!!m.shift !== input.shift) continue
      return def.action
    }
  }
  return null
}

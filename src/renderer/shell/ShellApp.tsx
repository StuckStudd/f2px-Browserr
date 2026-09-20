import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Bookmark, OverlayMenuItem, TabInfo } from '@shared/types'
import { ContextMenu } from '@renderer/components/ContextMenu'
import { useAppearance } from '@renderer/hooks/useAppearance'
import { childrenOf, useBookmarks } from '@renderer/hooks/useBookmarks'
import { useDownloads } from '@renderer/hooks/useDownloads'
import { useSettings } from '@renderer/hooks/useSettings'
import { call, fire, subscribe } from '@renderer/lib/api'
import { BookmarkPopup } from './BookmarkPopup'
import { BookmarksBar } from './BookmarksBar'
import { DownloadsPopup } from './DownloadsPopup'
import { FindBar } from './FindBar'
import { TabStrip } from './TabStrip'
import { Toolbar } from './Toolbar'
import type { OmniboxHandle } from './Omnibox'
import { useShellState } from './useShellState'

type Popup =
  | { type: 'downloads' }
  | { type: 'bookmark'; bookmark: Bookmark; right: number }
  | {
      type: 'menu'
      x: number
      y: number
      items: OverlayMenuItem[]
      onSelect: (id: string) => void
      onDismiss?: () => void
      anchor?: 'left' | 'right'
    }

const MAIN_MENU: OverlayMenuItem[] = [
  { id: 'newTab', label: 'New tab', shortcut: 'Ctrl+T' },
  { id: 'newWindow', label: 'New window', shortcut: 'Ctrl+N' },
  { id: 'private', label: 'New private window', shortcut: 'Ctrl+Shift+N' },
  { id: 's1', label: '', separator: true },
  { id: 'bookmarks', label: 'Bookmarks', shortcut: 'Ctrl+Shift+O' },
  { id: 'history', label: 'History', shortcut: 'Ctrl+H' },
  { id: 'downloads', label: 'Downloads', shortcut: 'Ctrl+J' },
  { id: 's2', label: '', separator: true },
  { id: 'zoomIn', label: 'Zoom in', shortcut: 'Ctrl++' },
  { id: 'zoomOut', label: 'Zoom out', shortcut: 'Ctrl+−' },
  { id: 'find', label: 'Find in page', shortcut: 'Ctrl+F' },
  { id: 'print', label: 'Print…', shortcut: 'Ctrl+P' },
  { id: 'fullscreen', label: 'Full screen', shortcut: 'F11' },
  { id: 'devtools', label: 'Developer tools', shortcut: 'F12' },
  { id: 's3', label: '', separator: true },
  { id: 'settings', label: 'Settings', shortcut: 'Ctrl+,' }
]

export function ShellApp() {
  const state = useShellState()
  const [settings, updateSettings] = useSettings()
  useAppearance(settings)
  const downloads = useDownloads()
  const bookmarks = useBookmarks()

  const [popup, setPopup] = useState<Popup | null>(null)
  const [omniboxOpen, setOmniboxOpen] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [findToken, setFindToken] = useState(0)
  const [downloadsFlash, setDownloadsFlash] = useState(false)
  const omniRef = useRef<OmniboxHandle>(null)
  const popupRef = useRef<Popup | null>(null)
  popupRef.current = popup

  const activeTab = useMemo<TabInfo | null>(
    () => state?.tabs.find((t) => t.id === state.activeId) ?? null,
    [state]
  )

  // ── popup plumbing ────────────────────────────────────────────────────
  const closePopup = useCallback(() => {
    const current = popupRef.current
    if (!current) return
    if (current.type === 'menu') current.onDismiss?.()
    setPopup(null)
  }, [])

  const wantsOverlay = popup !== null || omniboxOpen
  useEffect(() => {
    fire('ui.overlay', wantsOverlay)
  }, [wantsOverlay])

  useEffect(() => fire('ui.findBar', findOpen), [findOpen])

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!popupRef.current) return
      const target = e.target as HTMLElement | null
      if (target?.closest('[data-popup], [data-popup-trigger]')) return
      closePopup()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && popupRef.current) closePopup()
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', closePopup)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', closePopup)
    }
  }, [closePopup])

  const toolbarBottom = (): number => document.querySelector('.toolbar')?.getBoundingClientRect().bottom ?? 80

  const openMenuAt = useCallback(
    (
      x: number,
      y: number,
      items: OverlayMenuItem[],
      onSelect: (id: string) => void,
      onDismiss?: () => void,
      anchor: 'left' | 'right' = 'left'
    ) => {
      setPopup({ type: 'menu', x, y, items, onSelect, onDismiss, anchor })
    },
    []
  )

  const openFind = useCallback(() => {
    setFindOpen(true)
    setFindToken((t) => t + 1)
  }, [])

  const openBookmarkPopup = useCallback(async () => {
    if (popupRef.current?.type === 'bookmark') return closePopup()
    try {
      const bookmark = await call('bookmarks.ensureActive')
      if (!bookmark) return
      const rect = document.querySelector('.omni')?.getBoundingClientRect()
      setPopup({ type: 'bookmark', bookmark, right: rect ? window.innerWidth - rect.right : 16 })
    } catch (error) {
      console.error(error)
    }
  }, [closePopup])

  // ── main-process events ───────────────────────────────────────────────
  useEffect(() => {
    const offs = [
      subscribe('shell:show-menu', ({ menuId, x, y, items }) =>
        openMenuAt(
          x,
          y,
          items,
          (id) => fire('ui.menuSelect', menuId, id),
          () => fire('ui.menuSelect', menuId, null)
        )
      ),
      subscribe('shell:bookmark-popup', () => void openBookmarkPopup()),
      subscribe('shell:find', openFind),
      subscribe('shell:open-downloads', () => {
        setDownloadsFlash(true)
        window.setTimeout(() => setDownloadsFlash(false), 1800)
      })
    ]
    return () => offs.forEach((off) => off())
  }, [openMenuAt, openBookmarkPopup, openFind])

  // ── menus ─────────────────────────────────────────────────────────────
  const openMainMenu = (): void => {
    if (popup?.type === 'menu') return closePopup()
    const barLabel = settings?.showBookmarksBar ? 'Hide bookmarks bar' : 'Show bookmarks bar'
    const items = [...MAIN_MENU]
    items.splice(items.length - 2, 0, { id: 'bookmarksBar', label: barLabel, shortcut: 'Ctrl+Shift+B' })
    const menuActions = (id: string): void => {
      const actions: Record<string, () => void> = {
        newTab: () => fire('tabs.create'),
        newWindow: () => fire('ui.newWindow', false),
        private: () => fire('ui.newWindow', true),
        bookmarks: () => fire('ui.openPage', 'bookmarks'),
        history: () => fire('ui.openPage', 'history'),
        downloads: () => fire('ui.openPage', 'downloads'),
        zoomIn: () => fire('ui.zoom', 'in'),
        zoomOut: () => fire('ui.zoom', 'out'),
        find: openFind,
        print: () => fire('ui.print'),
        fullscreen: () => fire('ui.fullscreen'),
        devtools: () => fire('ui.devtools'),
        bookmarksBar: () => updateSettings({ showBookmarksBar: !settings?.showBookmarksBar }),
        settings: () => fire('ui.openPage', 'settings')
      }
      actions[id]?.()
    }
    openMenuAt(window.innerWidth - 8, toolbarBottom(), items, menuActions, undefined, 'right')
  }

  const openTabMenu = (tab: TabInfo, x: number, y: number): void => {
    const items: OverlayMenuItem[] = [
      { id: 'new', label: 'New tab', shortcut: 'Ctrl+T' },
      { id: 'duplicate', label: 'Duplicate' },
      { id: 'pin', label: tab.pinned ? 'Unpin tab' : 'Pin tab' },
      ...(tab.audible || tab.muted ? [{ id: 'mute', label: tab.muted ? 'Unmute site' : 'Mute site' }] : []),
      { id: 's1', label: '', separator: true },
      { id: 'close', label: 'Close tab', shortcut: 'Ctrl+W', disabled: tab.pinned },
      { id: 'others', label: 'Close other tabs' },
      { id: 'right', label: 'Close tabs to the right' },
      { id: 's2', label: '', separator: true },
      { id: 'reopen', label: 'Reopen closed tab', shortcut: 'Ctrl+Shift+T', disabled: !state?.canReopenTab }
    ]
    openMenuAt(x, y, items, (id) => {
      const actions: Record<string, () => void> = {
        new: () => fire('tabs.create'),
        duplicate: () => fire('tabs.duplicate', tab.id),
        pin: () => fire('tabs.pin', tab.id, !tab.pinned),
        mute: () => fire('tabs.mute', tab.id, !tab.muted),
        close: () => fire('tabs.close', tab.id),
        others: () => fire('tabs.closeOthers', tab.id),
        right: () => fire('tabs.closeToRight', tab.id),
        reopen: () => fire('tabs.reopen')
      }
      actions[id]?.()
    })
  }

  const openFolderMenu = (folder: Bookmark, x: number, y: number): void => {
    const children = childrenOf(bookmarks.items, folder.id)
    const items: OverlayMenuItem[] =
      children.length === 0
        ? [{ id: 'empty', label: 'Empty folder', disabled: true }]
        : children.map((c) => ({ id: c.id, label: c.type === 'folder' ? `▸ ${c.title}` : c.title, disabled: c.type === 'folder' }))
    openMenuAt(x, y, items, (id) => {
      const target = children.find((c) => c.id === id)
      if (target) fire('nav.go', target.url)
    })
  }

  const openBookmarkContext = (item: Bookmark, x: number, y: number): void => {
    const items: OverlayMenuItem[] =
      item.type === 'bookmark'
        ? [
            { id: 'open', label: 'Open' },
            { id: 'tab', label: 'Open in new tab' },
            { id: 's', label: '', separator: true },
            { id: 'manage', label: 'Bookmark manager' },
            { id: 'delete', label: 'Delete' }
          ]
        : [
            { id: 'manage', label: 'Bookmark manager' },
            { id: 'delete', label: 'Delete folder' }
          ]
    openMenuAt(x, y, items, (id) => {
      if (id === 'open') fire('nav.go', item.url)
      else if (id === 'tab') fire('nav.go', item.url, { newTab: true })
      else if (id === 'manage') fire('ui.openPage', 'bookmarks')
      else if (id === 'delete') fire('bookmarks.remove', item.id)
    })
  }

  if (!state) return <div className="shell" />

  return (
    <div className={`shell ${state.isPrivate ? 'is-private' : ''}`}>
      <div className="chrome">
        <TabStrip tabs={state.tabs} activeId={state.activeId} isPrivate={state.isPrivate} onTabMenu={openTabMenu} />
        <Toolbar
          state={state}
          tab={activeTab}
          downloads={downloads}
          downloadsFlash={downloadsFlash}
          downloadsOpen={popup?.type === 'downloads'}
          menuOpen={popup?.type === 'menu'}
          omniboxRef={omniRef}
          onOmniboxOpen={setOmniboxOpen}
          onStar={() => void openBookmarkPopup()}
          onToggleDownloads={() => (popup?.type === 'downloads' ? closePopup() : setPopup({ type: 'downloads' }))}
          onToggleMenu={openMainMenu}
        />
        {settings?.showBookmarksBar && (
          <BookmarksBar all={bookmarks.items} onFolder={openFolderMenu} onContext={openBookmarkContext} />
        )}
        {findOpen && (
          <FindBar
            focusToken={findToken}
            onClose={() => {
              setFindOpen(false)
              fire('ui.focusPage')
            }}
          />
        )}
      </div>

      {popup?.type === 'downloads' && <DownloadsPopup downloads={downloads} onClose={closePopup} />}
      {popup?.type === 'bookmark' && (
        <div className="popup-anchor" style={{ right: popup.right, top: toolbarBottom() + 2 }}>
          <BookmarkPopup bookmark={popup.bookmark} all={bookmarks.items} onClose={closePopup} />
        </div>
      )}
      {popup?.type === 'menu' && (
        <ContextMenu
          x={popup.x}
          y={popup.y}
          anchor={popup.anchor}
          items={popup.items}
          onSelect={(id) => {
            const { onSelect } = popup
            setPopup(null)
            onSelect(id)
          }}
          onClose={closePopup}
        />
      )}
    </div>
  )
}

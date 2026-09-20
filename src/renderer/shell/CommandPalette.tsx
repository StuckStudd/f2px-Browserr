import { useEffect, useMemo, useRef, useState } from 'react'
import type { Settings, ShellState, Suggestion, TabInfo } from '@shared/types'
import { hostOf } from '@shared/url'
import { Favicon } from '@renderer/components/Favicon'
import { Icon, type IconName } from '@renderer/components/Icon'
import { call, fire } from '@renderer/lib/api'

interface PaletteProps {
  mode: 'all' | 'tabs'
  state: ShellState
  tab: TabInfo | null
  settings: Settings | null
  onClose: () => void
  onFind: () => void
  onFire: () => void
}

interface Item {
  key: string
  icon?: IconName
  favicon?: string | null
  faviconLabel?: string
  title: string
  detail?: string
  kind: string
  run: () => void
}

/** How well `text` matches `query` (0 = not at all): prefix > word start > substring > letters in order. */
export function score(query: string, text: string): number {
  const q = query.toLowerCase().trim()
  const t = text.toLowerCase()
  if (!q) return 1
  if (t.startsWith(q)) return 100 - Math.min(40, t.length / 4)
  if (t.includes(` ${q}`) || t.includes(`/${q}`) || t.includes(`.${q}`)) return 70
  if (t.includes(q)) return 50
  let i = 0
  for (const ch of t) if (ch === q[i]) i++
  return i === q.length && q.length >= 2 ? 20 : 0
}

/** Ctrl+Shift+K: one box for actions, open tabs, bookmarks and history — and for the privacy controls. */
export function CommandPalette({ mode, state, tab, settings, onClose, onFind, onFire }: PaletteProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef(0)

  useEffect(() => inputRef.current?.focus(), [])

  // bookmarks / history / typed address, same source as the address bar
  useEffect(() => {
    if (mode === 'tabs' || query.trim().length < 2) {
      setSuggestions([])
      return
    }
    const id = ++requestRef.current
    const timer = window.setTimeout(() => {
      call('omnibox.suggest', query).then((list) => id === requestRef.current && setSuggestions(list), () => undefined)
    }, 90)
    return () => window.clearTimeout(timer)
  }, [query, mode])

  const done = (fn: () => void) => () => {
    onClose()
    fn()
  }

  const actions = useMemo<Item[]>(() => {
    const shieldsUp = tab?.shieldsUp ?? true
    const web = !!tab && tab.url.startsWith('http')
    const list: Item[] = [
      { key: 'a-newtab', icon: 'plus', title: 'New tab', detail: 'Ctrl+T', kind: 'Action', run: done(() => fire('tabs.create')) },
      { key: 'a-newwin', icon: 'window', title: 'New window', detail: 'Ctrl+N', kind: 'Action', run: done(() => fire('ui.newWindow', false)) },
      { key: 'a-priv', icon: 'private', title: 'New private window', detail: 'Ctrl+Shift+N', kind: 'Action', run: done(() => fire('ui.newWindow', true)) },
      { key: 'a-tor', icon: 'onion', title: 'New Tor window', detail: 'Ctrl+Shift+Alt+N', kind: 'Privacy', run: done(() => fire('ui.newTorWindow')) },
      { key: 'a-fire', icon: 'flame', title: 'Fire — clear everything…', detail: 'Ctrl+Shift+Del', kind: 'Privacy', run: done(onFire) },
      { key: 'a-center', icon: 'shield', title: 'Privacy center', detail: 'Ctrl+Shift+P', kind: 'Privacy', run: done(() => fire('ui.openPage', 'privacy')) },
      ...(web && !state.isTor
        ? [
            {
              key: 'a-shield',
              icon: (shieldsUp ? 'shieldOff' : 'shield') as IconName,
              title: shieldsUp ? 'Turn the shield off for this site' : 'Turn the shield on for this site',
              detail: hostOf(tab.url),
              kind: 'Privacy',
              run: done(() => fire('site.setShields', !shieldsUp))
            } satisfies Item
          ]
        : []),
      { key: 'a-l-std', icon: 'shield', title: 'Privacy level: Standard', kind: 'Privacy', run: done(() => fire('privacy.applyLevel', 'standard')) },
      { key: 'a-l-strict', icon: 'shield', title: 'Privacy level: Strict', kind: 'Privacy', run: done(() => fire('privacy.applyLevel', 'strict')) },
      { key: 'a-l-anon', icon: 'onion', title: 'Privacy level: Anonymous (Tor)', kind: 'Privacy', run: done(() => fire('privacy.applyLevel', 'anonymous')) },
      {
        key: 'a-cookies',
        icon: 'lock',
        title: settings?.blockThirdPartyCookies ? 'Allow third-party cookies' : 'Block third-party cookies',
        kind: 'Privacy',
        run: done(() => fire('settings.update', { blockThirdPartyCookies: !settings?.blockThirdPartyCookies }))
      },
      { key: 'a-history', icon: 'history', title: 'History', detail: 'Ctrl+H', kind: 'Page', run: done(() => fire('ui.openPage', 'history')) },
      { key: 'a-downloads', icon: 'download', title: 'Downloads', detail: 'Ctrl+J', kind: 'Page', run: done(() => fire('ui.openPage', 'downloads')) },
      { key: 'a-bookmarks', icon: 'bookmark', title: 'Bookmarks', detail: 'Ctrl+Shift+O', kind: 'Page', run: done(() => fire('ui.openPage', 'bookmarks')) },
      { key: 'a-settings', icon: 'settings', title: 'Settings', detail: 'Ctrl+,', kind: 'Page', run: done(() => fire('ui.openPage', 'settings')) },
      { key: 'a-reopen', icon: 'reload', title: 'Reopen closed tab', detail: 'Ctrl+Shift+T', kind: 'Action', run: done(() => fire('tabs.reopen')) },
      { key: 'a-find', icon: 'search', title: 'Find in page', detail: 'Ctrl+F', kind: 'Page', run: done(onFind) },
      { key: 'a-pdf', icon: 'file', title: 'Save page as PDF…', kind: 'Page', run: done(() => fire('ui.savePdf')) },
      { key: 'a-shot', icon: 'image', title: 'Screenshot…', kind: 'Page', run: done(() => fire('ui.screenshot')) },
      { key: 'a-print', icon: 'printer', title: 'Print…', detail: 'Ctrl+P', kind: 'Page', run: done(() => fire('ui.print')) },
      { key: 'a-zoomin', icon: 'plus', title: 'Zoom in', detail: 'Ctrl++', kind: 'Page', run: done(() => fire('ui.zoom', 'in')) },
      { key: 'a-zoomout', icon: 'minus', title: 'Zoom out', detail: 'Ctrl+−', kind: 'Page', run: done(() => fire('ui.zoom', 'out')) },
      { key: 'a-devtools', icon: 'code', title: 'Developer tools', detail: 'F12', kind: 'Page', run: done(() => fire('ui.devtools')) },
      { key: 'a-full', icon: 'fullscreen', title: 'Full screen', detail: 'F11', kind: 'Page', run: done(() => fire('ui.fullscreen')) }
    ]
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, state.isTor, settings?.blockThirdPartyCookies])

  const items = useMemo<Item[]>(() => {
    const tabs: Item[] = state.tabs
      .map((t) => ({
        item: {
          key: `t-${t.id}`,
          favicon: t.favicon,
          faviconLabel: t.displayUrl || t.title,
          title: t.title || hostOf(t.displayUrl) || 'New tab',
          detail: t.displayUrl,
          kind: t.id === state.activeId ? 'This tab' : 'Tab',
          run: done(() => fire('tabs.activate', t.id))
        } as Item,
        s: Math.max(score(query, t.title), score(query, t.displayUrl))
      }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.item)
    if (mode === 'tabs') return tabs

    const ranked = actions
      .map((a) => ({ a, s: Math.max(score(query, a.title), score(query, a.kind) * 0.4) }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s)
    const scored = ranked.map((x) => x.a)
    const links: Item[] = suggestions.map((s, i) => ({
      key: `s-${i}-${s.value}`,
      icon: s.kind === 'search' || s.kind === 'action' ? 'search' : undefined,
      favicon: s.favicon,
      faviconLabel: s.value,
      title: s.title,
      detail: s.kind === 'action' ? s.detail : s.detail === s.title ? '' : s.detail,
      kind: s.kind === 'action' ? 'Go' : s.kind === 'bookmark' ? 'Bookmark' : s.kind === 'history' ? 'History' : s.kind === 'top' ? 'Top site' : 'Search',
      run: done(() => fire('nav.go', s.value))
    }))
    if (!query.trim()) return [...scored.slice(0, 14), ...tabs.slice(0, 4)]
    // An address (or a plain search) leads — unless what was typed clearly names a command ("fire", "level: strict").
    const looksLikeAddress = /^[a-z][a-z0-9+.-]*:\/\//i.test(query.trim()) || /^[^\s/]+\.[a-z]{2,}(?:[/?#]|$)/i.test(query.trim())
    const commandLeads = !looksLikeAddress && (ranked[0]?.s ?? 0) >= 50
    return commandLeads
      ? [...scored.slice(0, 5), ...links.slice(0, 1), ...tabs.slice(0, 3), ...links.slice(1, 6)]
      : [...links.slice(0, 1), ...tabs.slice(0, 4), ...scored.slice(0, 6), ...links.slice(1, 7)]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mode, state.tabs, state.activeId, actions, suggestions])

  useEffect(() => setActive(0), [query, mode])
  useEffect(() => {
    document.querySelector('.palette__item.is-active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (items.length ? (i + 1) % items.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const chosen = items[active]
      if (chosen) chosen.run()
      else if (query.trim()) done(() => fire('nav.go', query.trim()))()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <section className="palette" data-popup role="dialog" aria-label={mode === 'tabs' ? 'Search tabs' : 'Command palette'}>
      <div className="palette__field">
        <Icon name="search" size={15} />
        <input
          ref={inputRef}
          className="palette__input"
          value={query}
          spellCheck={false}
          autoComplete="off"
          placeholder={mode === 'tabs' ? 'Search open tabs' : 'Type a command, a tab, a bookmark or an address'}
          aria-label="Command palette"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <span className="palette__hint mono">{mode === 'tabs' ? 'TABS' : 'ESC'}</span>
      </div>
      <ul className="palette__list" role="listbox">
        {items.length === 0 && <li className="palette__empty">Nothing matches — press Enter to search or open “{query}”</li>}
        {items.map((item, i) => (
          <li
            key={item.key}
            role="option"
            aria-selected={i === active}
            className={`palette__item ${i === active ? 'is-active' : ''}`}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => {
              e.preventDefault()
              item.run()
            }}
          >
            <span className="palette__icon">
              {item.icon ? <Icon name={item.icon} size={14} /> : <Favicon src={item.favicon} label={item.faviconLabel ?? item.title} size={14} />}
            </span>
            <span className="palette__title">{item.title}</span>
            {item.detail && <span className="palette__detail">{item.detail}</span>}
            <span className="palette__kind">{item.kind}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

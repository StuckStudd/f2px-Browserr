import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Suggestion, TabInfo } from '@shared/types'
import { Favicon } from '@renderer/components/Favicon'
import { Icon } from '@renderer/components/Icon'
import { LogoMark } from '@renderer/components/Logo'
import { call, fire, subscribe } from '@renderer/lib/api'

export interface OmniboxHandle {
  focus: () => void
}

interface OmniboxProps {
  tab: TabInfo | null
  bookmarked: boolean
  zoomPercent: number
  /** Trackers blocked on the current page. */
  blocked: number
  onOpenChange: (open: boolean) => void
  onStar: () => void
}

const KIND_LABEL: Record<Suggestion['kind'], string> = {
  action: '',
  bookmark: 'Bookmark',
  history: 'History',
  top: 'Top site',
  search: 'Search'
}

/** scheme / host / rest, so the domain reads first and the rest recedes. */
function DisplayUrl({ url }: { url: string }) {
  try {
    const u = new URL(url)
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      const rest = `${u.pathname === '/' ? '' : u.pathname}${u.search}${u.hash}`
      return (
        <>
          <span className="omni__scheme">{u.protocol}//</span>
          <span className="omni__host">{u.host}</span>
          <span className="omni__rest">{rest}</span>
        </>
      )
    }
  } catch {
    /* not a URL: render as plain text */
  }
  return <span className="omni__host">{url}</span>
}

export const Omnibox = forwardRef<OmniboxHandle, OmniboxProps>(function Omnibox(
  { tab, bookmarked, zoomPercent, blocked, onOpenChange, onStar },
  ref
) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [value, setValue] = useState('')
  /** What the user actually typed; suggestions follow this, not the arrow-key preview in `value`. */
  const [query, setQuery] = useState('')
  const [edited, setEdited] = useState(false)
  const [local, setLocal] = useState<Suggestion[]>([])
  const [remote, setRemote] = useState<string[]>([])
  const [active, setActive] = useState(-1)
  const typedRef = useRef('')
  const requestRef = useRef(0)

  const shownUrl = tab?.displayUrl ?? ''
  const suggestions: Suggestion[] = [
    ...local,
    ...remote
      .filter((r) => !local.some((l) => l.kind === 'action' && l.value.toLowerCase() === r.toLowerCase()))
      .map<Suggestion>((r) => ({ kind: 'search', title: r, value: r, detail: '', favicon: null }))
  ]
  const open = focused && suggestions.length > 0

  useEffect(() => onOpenChange(open), [open, onOpenChange])

  // keep the field in sync with the page while the user is not editing
  useEffect(() => {
    if (!focused) {
      setValue(shownUrl)
      setEdited(false)
    }
  }, [shownUrl, focused, tab?.id])

  const focusAndSelect = useCallback(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useImperativeHandle(ref, () => ({ focus: focusAndSelect }), [focusAndSelect])
  useEffect(() => subscribe('shell:focus-omnibox', focusAndSelect), [focusAndSelect])

  // local suggestions on every change
  useEffect(() => {
    if (!focused) return
    const id = ++requestRef.current
    call('omnibox.suggest', edited ? query : '').then(
      (list) => id === requestRef.current && setLocal(list),
      () => undefined
    )
  }, [query, edited, focused])

  // remote (search engine) suggestions, debounced
  useEffect(() => {
    setRemote([])
    if (!focused || !edited || query.trim().length < 2) return
    const text = query
    const timer = window.setTimeout(() => {
      call('omnibox.remote', text).then(
        (list) => text === typedRef.current && setRemote(list),
        () => undefined
      )
    }, 160)
    return () => window.clearTimeout(timer)
  }, [query, edited, focused])

  const submit = (text: string, newTab: boolean): void => {
    if (!text.trim()) return
    fire('nav.go', text, { newTab })
    inputRef.current?.blur()
    setFocused(false)
    fire('ui.focusPage')
  }

  const move = (delta: number): void => {
    if (suggestions.length === 0) return
    const next = (active + delta + suggestions.length + 1) % (suggestions.length + 1) - 1
    setActive(next)
    // preview the highlighted entry in the field; index -1 restores what the user typed
    setValue(next < 0 ? typedRef.current : suggestions[next].kind === 'action' ? typedRef.current : suggestions[next].value)
  }

  const security = tab?.security ?? 'internal'

  return (
    <div className={`omni ${focused ? 'is-focused' : ''}`} data-popup-trigger>
      <span className={`omni__security omni__security--${security}`} title={security === 'secure' ? 'Connection is secure' : undefined}>
        {security === 'internal' ? (
          <LogoMark size={14} />
        ) : security === 'secure' ? (
          <Icon name="lock" size={13} />
        ) : security === 'local' ? (
          <Icon name="file" size={13} />
        ) : (
          <>
            <Icon name="warning" size={13} />
            {security === 'insecure' && <span className="omni__warn">NOT SECURE</span>}
          </>
        )}
      </span>

      <div className="omni__field">
        {!focused && shownUrl && (
          <div className="omni__display" aria-hidden="true">
            <DisplayUrl url={shownUrl} />
          </div>
        )}
        <input
          ref={inputRef}
          className="omni__input"
          value={value}
          spellCheck={false}
          autoComplete="off"
          placeholder="Search or enter address"
          aria-label="Address bar"
          aria-expanded={open}
          onFocus={() => {
            setFocused(true)
            inputRef.current?.select()
          }}
          onBlur={() => {
            setFocused(false)
            setActive(-1)
          }}
          onChange={(e) => {
            typedRef.current = e.target.value
            setValue(e.target.value)
            setQuery(e.target.value)
            setEdited(true)
            setActive(-1)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              move(1)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              move(-1)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const chosen = active >= 0 ? suggestions[active] : null
              submit(chosen && chosen.kind !== 'action' ? chosen.value : value, e.altKey)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              if (open && edited) {
                setEdited(false)
                setValue(shownUrl)
                setQuery('')
                setRemote([])
                setActive(-1)
                inputRef.current?.select()
              } else {
                setValue(shownUrl)
                inputRef.current?.blur()
                fire('ui.focusPage')
              }
            }
          }}
        />
      </div>

      {blocked > 0 && (
        <button
          type="button"
          className="omni__shield"
          title={`${blocked} tracker${blocked === 1 ? '' : 's'} blocked on this page`}
          aria-label={`${blocked} trackers blocked`}
          onClick={() => fire('ui.openPage', 'settings')}
        >
          <Icon name="shield" size={13} />
          <span>{blocked}</span>
        </button>
      )}
      {zoomPercent !== 100 && (
        <button type="button" className="omni__chip" title="Reset zoom" onClick={() => fire('ui.zoom', 'reset')}>
          {zoomPercent}%
        </button>
      )}
      {tab && (tab.url.startsWith('http') ) && (
        <button
          type="button"
          className={`omni__star ${bookmarked ? 'is-on' : ''}`}
          aria-label={bookmarked ? 'Edit bookmark' : 'Bookmark this page'}
          title="Bookmark this page (Ctrl+D)"
          onClick={onStar}
          data-popup-trigger
        >
          <Icon name="star" size={15} filled={bookmarked} />
        </button>
      )}

      {open && (
        <ul className="omni__list" role="listbox" data-popup>
          {suggestions.map((s, i) => (
            <li
              key={`${s.kind}-${s.value}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`omni__item ${i === active ? 'is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                submit(s.value, e.button === 1)
              }}
            >
              <span className="omni__item-icon">
                {s.kind === 'search' || (s.kind === 'action' && !/^https?:/i.test(s.title)) ? (
                  <Icon name="search" size={14} />
                ) : s.kind === 'action' ? (
                  <Icon name="globe" size={14} />
                ) : (
                  <Favicon src={s.favicon} label={s.value} size={14} />
                )}
              </span>
              <span className="omni__item-title">{s.title}</span>
              {s.detail && s.detail !== s.title && <span className="omni__item-detail">{s.detail}</span>}
              <span className="omni__item-kind">{s.kind === 'action' ? s.detail : KIND_LABEL[s.kind]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})

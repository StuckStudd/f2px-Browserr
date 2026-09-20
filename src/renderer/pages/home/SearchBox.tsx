import { useEffect, useRef, useState } from 'react'
import { SEARCH_ENGINES } from '@shared/settings'
import type { SearchEngineId, Suggestion } from '@shared/types'
import { Favicon } from '@renderer/components/Favicon'
import { Icon } from '@renderer/components/Icon'
import { call, fire } from '@renderer/lib/api'

/** Start-page search box; doubles as an address bar (same rules as the omnibox). */
export function SearchBox({ engine }: { engine: SearchEngineId }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [typed, setTyped] = useState('')
  const [focused, setFocused] = useState(false)
  const [local, setLocal] = useState<Suggestion[]>([])
  const [remote, setRemote] = useState<string[]>([])
  const [active, setActive] = useState(-1)

  useEffect(() => inputRef.current?.focus(), [])

  useEffect(() => {
    if (!typed.trim()) {
      setLocal([])
      setRemote([])
      return
    }
    let alive = true
    call('omnibox.suggest', typed).then((l) => alive && setLocal(l.filter((s) => s.kind !== 'action')), () => undefined)
    const timer = window.setTimeout(() => {
      call('omnibox.remote', typed).then((r) => alive && setRemote(r), () => undefined)
    }, 160)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [typed])

  const rows: { key: string; title: string; detail: string; value: string; favicon: string | null; search: boolean }[] = [
    ...local.slice(0, 4).map((s) => ({ key: `l-${s.value}`, title: s.title, detail: s.detail, value: s.value, favicon: s.favicon, search: false })),
    ...remote.slice(0, 4).map((r) => ({ key: `r-${r}`, title: r, detail: '', value: r, favicon: null, search: true }))
  ]
  const open = focused && rows.length > 0

  const go = (text: string, newTab = false): void => {
    if (text.trim()) fire('page.navigate', text, { newTab })
  }

  return (
    <div className={`hsearch ${focused ? 'is-focused' : ''}`}>
      <div className="hsearch__box">
        <Icon name="search" size={16} />
        <input
          ref={inputRef}
          className="hsearch__input"
          value={value}
          placeholder="Search or enter address"
          aria-label="Search or enter address"
          spellCheck={false}
          autoComplete="off"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setValue(e.target.value)
            setTyped(e.target.value)
            setActive(-1)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              const n = rows.length + 1
              const next = ((active + (e.key === 'ArrowDown' ? 1 : -1) + 1 + n) % n) - 1
              setActive(next)
              setValue(next < 0 ? typed : rows[next].value)
            } else if (e.key === 'Enter') {
              go(value, e.altKey)
            } else if (e.key === 'Escape') {
              setValue('')
              setTyped('')
            }
          }}
        />
        <span className="hsearch__engine">{SEARCH_ENGINES[engine].name}</span>
        <kbd className="hsearch__enter">↵</kbd>
      </div>
      {open && (
        <ul className="hsearch__list" role="listbox">
          {rows.map((r, i) => (
            <li
              key={r.key}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : ''}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                go(r.value, e.button === 1)
              }}
            >
              {r.search ? <Icon name="search" size={14} /> : <Favicon src={r.favicon} label={r.value} size={14} />}
              <span className="hsearch__title">{r.title}</span>
              {r.detail && r.detail !== r.title && <span className="hsearch__detail">{r.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

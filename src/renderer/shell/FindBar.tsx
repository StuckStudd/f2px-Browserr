import { useEffect, useRef, useState } from 'react'
import type { FindState } from '@shared/types'
import { Icon } from '@renderer/components/Icon'
import { fire, subscribe } from '@renderer/lib/api'

interface Props {
  focusToken: number
  onClose: () => void
}

/** Find-in-page row: sits between the toolbar and the page, so the page stays interactive. */
export function FindBar({ focusToken, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [result, setResult] = useState<FindState | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusToken])

  useEffect(() => subscribe('shell:find-result', setResult), [])

  useEffect(() => {
    setResult(null)
    fire('find.start', text, true, matchCase)
  }, [text, matchCase])

  useEffect(() => () => fire('find.stop'), [])

  const step = (forward: boolean): void => fire('find.start', text, forward, matchCase)

  return (
    <div className="findbar" data-popup-trigger>
      <span className="label">Find</span>
      <input
        ref={inputRef}
        className="findbar__input"
        value={text}
        placeholder="Find in page"
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') step(!e.shiftKey)
          else if (e.key === 'Escape') onClose()
        }}
      />
      <span className="findbar__count mono">{text ? (result ? `${result.active}/${result.total}` : '…') : ''}</span>
      <button type="button" className="tbtn" aria-label="Previous match" onClick={() => step(false)} disabled={!text}>
        <Icon name="arrowUp" size={14} />
      </button>
      <button type="button" className="tbtn" aria-label="Next match" onClick={() => step(true)} disabled={!text}>
        <Icon name="arrowDown" size={14} />
      </button>
      <button
        type="button"
        className={`findbar__case ${matchCase ? 'is-on' : ''}`}
        title="Match case"
        aria-pressed={matchCase}
        onClick={() => setMatchCase((v) => !v)}
      >
        Aa
      </button>
      <button type="button" className="tbtn" aria-label="Close find bar" onClick={onClose}>
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { OverlayMenuItem } from '@shared/types'

interface ContextMenuProps {
  x: number
  y: number
  /** `right`: `x` is the right edge the menu hangs from (used by toolbar dropdowns). */
  anchor?: 'left' | 'right'
  items: OverlayMenuItem[]
  onSelect: (id: string) => void
  onClose: () => void
}

/** F2PX-styled menu used for right-click menus and dropdowns. Keyboard: ↑ ↓ Enter Esc. */
export function ContextMenu({ x, y, anchor = 'left', items, onSelect, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  const enabled = items.filter((i) => !i.separator && !i.disabled)
  const [active, setActive] = useState<string | null>(null)
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight })

  // The shell view grows when a menu opens; clamp again once the real viewport size is known.
  useEffect(() => {
    const onResize = (): void => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const left = anchor === 'right' ? x - width : x
    setPos({
      x: Math.max(4, Math.min(left, viewport.w - width - 4)),
      y: Math.max(4, Math.min(y, viewport.h - height - 4))
    })
  }, [x, y, anchor, items, viewport])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const idx = enabled.findIndex((i) => i.id === active)
        const next = e.key === 'ArrowDown' ? idx + 1 : idx - 1
        setActive(enabled[(next + enabled.length) % enabled.length]?.id ?? null)
      } else if (e.key === 'Enter' && active) {
        e.preventDefault()
        onSelect(active)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div
      ref={ref}
      className="menu"
      data-popup
      style={{ left: pos.x, top: pos.y }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) =>
        item.separator ? (
          <div key={item.id} className="menu__sep" role="separator" />
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={`menu__item ${active === item.id ? 'is-active' : ''}`}
            disabled={item.disabled}
            onMouseEnter={() => setActive(item.id)}
            onClick={() => onSelect(item.id)}
          >
            <span>{item.label}</span>
            {item.shortcut && <span className="menu__shortcut">{item.shortcut}</span>}
          </button>
        )
      )}
    </div>
  )
}

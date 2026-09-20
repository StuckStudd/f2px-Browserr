import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { TabInfo } from '@shared/types'
import { hostOf, internalPageOf } from '@shared/url'
import { Favicon } from '@renderer/components/Favicon'
import { Icon } from '@renderer/components/Icon'
import { LogoMark } from '@renderer/components/Logo'
import { fire } from '@renderer/lib/api'

interface TabStripProps {
  tabs: TabInfo[]
  activeId: number | null
  isPrivate: boolean
  isTor?: boolean
  onTabMenu: (tab: TabInfo, x: number, y: number) => void
}

const DRAG_TYPE = 'text/x-f2px-tab'

function tabTitle(tab: TabInfo): string {
  if (tab.title) return tab.title
  const page = internalPageOf(tab.url)
  if (page === 'home') return 'New tab'
  if (page) return page.charAt(0).toUpperCase() + page.slice(1)
  return hostOf(tab.displayUrl) || tab.displayUrl || 'New tab'
}

export function TabStrip({ tabs, activeId, isPrivate, isTor = false, onTabMenu }: TabStripProps) {
  const [dragId, setDragId] = useState<number | null>(null)
  const [drop, setDrop] = useState<number | null>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<'normal' | 'small' | 'tiny'>('normal')

  // With many tabs the strip degrades gracefully: first hide close buttons, then titles.
  useEffect(() => {
    const el = tabsRef.current
    if (!el) return
    const measure = (): void => {
      const pinned = tabs.filter((t) => t.pinned).length
      const width = (el.clientWidth - pinned * 40) / Math.max(1, tabs.length - pinned)
      setSize(width < 58 ? 'tiny' : width < 104 ? 'small' : 'normal')
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [tabs])

  const onDragOver = (e: DragEvent, index: number): void => {
    if (dragId === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    setDrop(e.clientX < rect.left + rect.width / 2 ? index : index + 1)
  }

  const finishDrag = (): void => {
    if (dragId !== null && drop !== null) {
      const from = tabs.findIndex((t) => t.id === dragId)
      const to = from < drop ? drop - 1 : drop
      if (from >= 0 && to !== from) fire('tabs.move', dragId, to)
    }
    setDragId(null)
    setDrop(null)
  }

  return (
    <div className="tabstrip">
      {isTor ? (
        <div className="tabstrip__private tabstrip__private--tor" title="Tor window: all traffic goes through the Tor network; nothing is kept when it closes">
          <Icon name="onion" size={13} />
          <span>TOR</span>
        </div>
      ) : (
        isPrivate && (
          <div className="tabstrip__private" title="Private window: history and cookies are discarded when it closes">
            <Icon name="private" size={13} />
            <span>PRIVATE</span>
          </div>
        )
      )}
      <div ref={tabsRef} data-size={size} className="tabstrip__tabs" role="tablist" onDragLeave={(e) => e.currentTarget === e.target && setDrop(null)}>
        {tabs.map((tab, index) => {
          const active = tab.id === activeId
          const internal = tab.security === 'internal' || tab.security === 'error'
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              draggable
              title={tab.title || tab.displayUrl}
              className={[
                'tab',
                active && 'is-active',
                tab.pinned && 'is-pinned',
                dragId === tab.id && 'is-dragging',
                drop === index && dragId !== null && 'drop-before',
                drop === index + 1 && index === tabs.length - 1 && dragId !== null && 'drop-after'
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseDown={(e) => {
                if (e.button === 0) fire('tabs.activate', tab.id)
                if (e.button === 1) e.preventDefault()
              }}
              onAuxClick={(e) => {
                if (e.button === 1) fire('tabs.close', tab.id)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                onTabMenu(tab, e.clientX, e.clientY)
              }}
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_TYPE, String(tab.id))
                e.dataTransfer.effectAllowed = 'move'
                setDragId(tab.id)
              }}
              onDragOver={(e) => onDragOver(e, index)}
              onDrop={(e) => {
                e.preventDefault()
                finishDrag()
              }}
              onDragEnd={finishDrag}
            >
              <span className="tab__icon">
                {tab.loading ? (
                  <span className="tab__spinner" />
                ) : internal && !tab.favicon ? (
                  <LogoMark size={14} />
                ) : (
                  <Favicon src={tab.favicon} label={tab.displayUrl || tab.title} size={14} />
                )}
              </span>
              {!tab.pinned && <span className="tab__title">{tabTitle(tab)}</span>}
              {(tab.audible || tab.muted) && (
                <button
                  type="button"
                  className="tab__audio"
                  aria-label={tab.muted ? 'Unmute tab' : 'Mute tab'}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    fire('tabs.mute', tab.id, !tab.muted)
                  }}
                >
                  <Icon name={tab.muted ? 'mute' : 'volume'} size={12} />
                </button>
              )}
              {!tab.pinned && (
                <button
                  type="button"
                  className="tab__close"
                  aria-label="Close tab"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    fire('tabs.close', tab.id)
                  }}
                >
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>
          )
        })}
      </div>
      <button type="button" className="tabstrip__new" aria-label="New tab" title="New tab (Ctrl+T)" onClick={() => fire('tabs.create')}>
        <Icon name="plus" size={15} />
      </button>
      <div className="tabstrip__spacer" />
    </div>
  )
}

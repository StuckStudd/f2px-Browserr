import { useCallback, useEffect, useState, type DragEvent, type MouseEvent } from 'react'
import type { QuickAccessItem } from '@shared/types'
import { hostOf } from '@shared/url'
import { Button } from '@renderer/components/Controls'
import { ContextMenu } from '@renderer/components/ContextMenu'
import { monogram } from '@renderer/components/Favicon'
import { Icon } from '@renderer/components/Icon'
import { call, fire, subscribe } from '@renderer/lib/api'
import { QuickAccessDialog } from './QuickAccessDialog'

function TileIcon({ item, favicon }: { item: QuickAccessItem; favicon?: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [item.icon, favicon])

  if (item.icon.startsWith('text:')) return <span className="qa__mono">{item.icon.slice(5)}</span>
  if (item.icon && !failed) {
    return <img className="qa__img" src={item.icon} alt="" draggable={false} onError={() => setFailed(true)} />
  }
  if (!item.icon && favicon && !failed) {
    return <img className="qa__img qa__img--auto" src={favicon} alt="" draggable={false} onError={() => setFailed(true)} />
  }
  return <span className="qa__mono">{monogram(item.title || item.url)}</span>
}

export function QuickAccess({ onMessage }: { onMessage: (text: string, tone?: 'info' | 'error') => void }) {
  const [items, setItems] = useState<QuickAccessItem[]>([])
  const [loading, setLoading] = useState(true)
  const [favicons, setFavicons] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<QuickAccessItem | 'new' | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; item: QuickAccessItem } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [drop, setDrop] = useState<number | null>(null)

  const reload = useCallback(() => {
    call('quickAccess.list').then(
      (list) => {
        setItems(list)
        setLoading(false)
      },
      () => setLoading(false)
    )
  }, [])

  useEffect(() => {
    reload()
    return subscribe('quickAccess:changed', reload)
  }, [reload])

  // icons the browser already learned while browsing (stored locally, no third-party lookups)
  useEffect(() => {
    const hosts = [...new Set(items.map((i) => hostOf(i.url)).filter(Boolean))]
    if (hosts.length === 0) return
    call('favicons.forHosts', hosts).then(setFavicons, () => undefined)
  }, [items])

  const open = (e: MouseEvent, item: QuickAccessItem): void => {
    fire('page.navigate', item.url, { newTab: e.ctrlKey || e.button === 1 })
  }

  const finishDrag = (): void => {
    if (dragId && drop !== null) {
      const from = items.findIndex((i) => i.id === dragId)
      const to = from < drop ? drop - 1 : drop
      if (from >= 0 && to !== from) {
        const next = [...items]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        setItems(next) // optimistic
        fire('quickAccess.reorder', next.map((i) => i.id))
      }
    }
    setDragId(null)
    setDrop(null)
  }

  const onDragOver = (e: DragEvent, index: number): void => {
    if (!dragId) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    setDrop(e.clientX < rect.left + rect.width / 2 ? index : index + 1)
  }

  return (
    <section className="qa" aria-label="Quick access">
      <div className="qa__head">
        <span className="label">Quick access</span>
        <span className="qa__line" />
        <button type="button" className="qa__add" onClick={() => setEditing('new')}>
          <Icon name="plus" size={12} /> ADD
        </button>
      </div>

      {!loading && items.length === 0 ? (
        <div className="qa__empty">
          <span className="label">No shortcuts</span>
          <div className="qa__empty-actions">
            <Button icon="plus" onClick={() => setEditing('new')}>
              Add site
            </Button>
            <Button variant="ghost" onClick={() => call('quickAccess.reset').then(setItems, () => undefined)}>
              Restore defaults
            </Button>
          </div>
        </div>
      ) : (
        <div className="qa__grid" onDragLeave={(e) => e.currentTarget === e.target && setDrop(null)}>
          {items.map((item, index) => (
            <a
              key={item.id}
              href={item.url}
              draggable
              className={[
                'qa__tile',
                dragId === item.id && 'is-dragging',
                drop === index && dragId && 'drop-before',
                drop === index + 1 && index === items.length - 1 && dragId && 'drop-after'
              ]
                .filter(Boolean)
                .join(' ')}
              title={`${item.title}\n${item.url}`}
              onClick={(e) => {
                e.preventDefault()
                open(e, item)
              }}
              onAuxClick={(e) => {
                e.preventDefault()
                if (e.button === 1) open(e, item)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ x: e.clientX, y: e.clientY, item })
              }}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', item.id)
                setDragId(item.id)
              }}
              onDragOver={(e) => onDragOver(e, index)}
              onDrop={(e) => {
                e.preventDefault()
                finishDrag()
              }}
              onDragEnd={finishDrag}
            >
              <span className="qa__icon">
                <TileIcon item={item} favicon={favicons[hostOf(item.url)]} />
              </span>
              <span className="qa__title">{item.title}</span>
              <button
                type="button"
                className="qa__more"
                aria-label={`Options for ${item.title}`}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const r = e.currentTarget.getBoundingClientRect()
                  setMenu({ x: r.left, y: r.bottom + 2, item })
                }}
              >
                <Icon name="dots" size={12} />
              </button>
            </a>
          ))}
        </div>
      )}

      {menu && (
        <>
          <div className="backdrop" onMouseDown={() => setMenu(null)} onContextMenu={(e) => e.preventDefault()} />
          <ContextMenu
            x={menu.x}
            y={menu.y}
            items={[
              { id: 'open', label: 'Open' },
              { id: 'tab', label: 'Open in new tab' },
              { id: 's', label: '', separator: true },
              { id: 'edit', label: 'Edit…' },
              { id: 'remove', label: 'Remove' }
            ]}
            onClose={() => setMenu(null)}
            onSelect={(id) => {
              const { item } = menu
              setMenu(null)
              if (id === 'open') fire('page.navigate', item.url)
              else if (id === 'tab') fire('page.navigate', item.url, { newTab: true })
              else if (id === 'edit') setEditing(item)
              else if (id === 'remove') fire('quickAccess.remove', item.id)
            }}
          />
        </>
      )}

      {editing && (
        <QuickAccessDialog
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={reload}
          onError={(message) => onMessage(message, 'error')}
        />
      )}
    </section>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { HistoryEntry } from '@shared/types'
import { hostOf } from '@shared/url'
import { Button, Segmented } from '@renderer/components/Controls'
import { Dialog } from '@renderer/components/Dialog'
import { EmptyState, Loading } from '@renderer/components/EmptyState'
import { Favicon } from '@renderer/components/Favicon'
import { Icon } from '@renderer/components/Icon'
import { useToast } from '@renderer/components/Toast'
import { call, fire, subscribe } from '@renderer/lib/api'
import { dayKey, dayLabel, formatClock } from '@renderer/lib/format'
import { PageFrame } from './PageFrame'

type Sort = 'newest' | 'oldest' | 'site'
const PAGE_SIZE = 400

interface Group {
  key: string
  label: string
  entries: HistoryEntry[]
}

function groupEntries(entries: HistoryEntry[], sort: Sort): Group[] {
  const groups = new Map<string, Group>()
  for (const e of entries) {
    const key = dayKey(e.visitedAt)
    const group = groups.get(key) ?? { key, label: dayLabel(e.visitedAt), entries: [] }
    group.entries.push(e)
    groups.set(key, group)
  }
  const list = [...groups.values()]
  const dir = sort === 'oldest' ? 1 : -1
  list.sort((a, b) => dir * (Number(a.key) - Number(b.key)))
  for (const g of list) {
    if (sort === 'site') g.entries.sort((a, b) => hostOf(a.url).localeCompare(hostOf(b.url)) || b.visitedAt - a.visitedAt)
    else g.entries.sort((a, b) => dir * (a.visitedAt - b.visitedAt))
  }
  return list
}

export function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('newest')
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const { toast, node } = useToast()
  const requestRef = useRef(0)
  const loadedRef = useRef(0)
  loadedRef.current = entries.length

  const load = useCallback(
    (text: string, limit = PAGE_SIZE) => {
      const id = ++requestRef.current
      call('history.list', { query: text, limit, offset: 0 }).then(
        (list) => {
          if (id !== requestRef.current) return
          setEntries(list)
          setHasMore(list.length >= limit)
          setLoading(false)
        },
        (e: Error) => {
          setLoading(false)
          toast(e.message, 'error')
        }
      )
    },
    [toast]
  )

  // search (debounced)
  useEffect(() => {
    const timer = window.setTimeout(() => load(query), query ? 180 : 0)
    return () => window.clearTimeout(timer)
  }, [query, load])

  // live refresh when pages are visited elsewhere
  useEffect(() => {
    let timer: number | undefined
    const off = subscribe('history:changed', () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => load(query, Math.max(PAGE_SIZE, loadedRef.current)), 400)
    })
    return () => {
      off()
      window.clearTimeout(timer)
    }
  }, [query, load])

  const loadMore = (): void => {
    const id = ++requestRef.current
    call('history.list', { query, limit: PAGE_SIZE, offset: loadedRef.current }).then(
      (list) => {
        if (id !== requestRef.current) return
        setEntries((prev) => [...prev, ...list])
        setHasMore(list.length >= PAGE_SIZE)
      },
      (e: Error) => toast(e.message, 'error')
    )
  }

  const groups = useMemo(() => groupEntries(entries, sort), [entries, sort])

  const removeIds = (ids: number[]): void => {
    setEntries((prev) => prev.filter((e) => !ids.includes(e.id))) // optimistic
    fire('history.remove', ids)
  }

  const open = (entry: HistoryEntry, newTab: boolean): void => fire('page.navigate', entry.url, { newTab })

  return (
    <PageFrame
      code="History"
      title="History"
      actions={
        <Button variant="danger" icon="trash" disabled={entries.length === 0 && !query} onClick={() => setConfirmClear(true)}>
          Clear all
        </Button>
      }
      toolbar={
        <div className="pbar">
          <label className="pbar__search">
            <Icon name="search" size={14} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search history" aria-label="Search history" spellCheck={false} />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
                <Icon name="close" size={12} />
              </button>
            )}
          </label>
          <Segmented
            label="Sort"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'newest', label: 'Newest' },
              { value: 'oldest', label: 'Oldest' },
              { value: 'site', label: 'By site' }
            ]}
          />
        </div>
      }
    >
      {loading ? (
        <Loading />
      ) : entries.length === 0 ? (
        <EmptyState
          icon="history"
          title={query ? 'No matches' : 'History is empty'}
          hint={query ? `Nothing in your history matches “${query}”.` : 'Pages you visit are listed here. Private windows are never recorded.'}
        />
      ) : (
        <>
          {groups.map((group) => (
            <section key={group.key} className="hgroup">
              <header className="hgroup__head">
                <span className="label hgroup__label">{group.label}</span>
                <span className="hgroup__line" />
                <span className="hgroup__count mono">{group.entries.length}</span>
                <button type="button" className="hgroup__delete" onClick={() => removeIds(group.entries.map((e) => e.id))}>
                  <Icon name="trash" size={12} /> Delete group
                </button>
              </header>
              {group.entries.map((entry) => (
                <div key={entry.id} className="hrow">
                  <time className="hrow__time mono">{formatClock(new Date(entry.visitedAt))}</time>
                  <a
                    className="hrow__main"
                    href={entry.url}
                    title={entry.url}
                    onClick={(e) => {
                      e.preventDefault()
                      open(entry, e.ctrlKey)
                    }}
                    onAuxClick={(e) => {
                      e.preventDefault()
                      if (e.button === 1) open(entry, true)
                    }}
                  >
                    <Favicon src={entry.favicon} label={entry.url} size={16} />
                    <span className="hrow__text">
                      <span className="hrow__title">{entry.title || entry.url}</span>
                      <span className="hrow__host mono">{hostOf(entry.url) || entry.url}</span>
                    </span>
                  </a>
                  <button type="button" className="hrow__delete" aria-label="Remove from history" title="Remove from history" onClick={() => removeIds([entry.id])}>
                    <Icon name="close" size={13} />
                  </button>
                </div>
              ))}
            </section>
          ))}
          {hasMore && (
            <div className="more">
              <Button onClick={loadMore}>Load more</Button>
            </div>
          )}
        </>
      )}

      {confirmClear && (
        <Dialog
          title="Clear browsing history"
          danger
          submitLabel="Clear history"
          onClose={() => setConfirmClear(false)}
          onSubmit={() => {
            setConfirmClear(false)
            setEntries([])
            call('history.clear').then(() => toast('History cleared'), (e: Error) => toast(e.message, 'error'))
          }}
        >
          <p className="dialog__text">All visited pages will be permanently removed from this device. Bookmarks and downloads are not affected.</p>
        </Dialog>
      )}
      {node}
    </PageFrame>
  )
}

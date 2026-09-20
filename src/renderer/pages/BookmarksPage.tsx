import { useMemo, useState, type DragEvent } from 'react'
import type { Bookmark } from '@shared/types'
import { Button } from '@renderer/components/Controls'
import { Dialog, Field } from '@renderer/components/Dialog'
import { EmptyState, Loading } from '@renderer/components/EmptyState'
import { Favicon } from '@renderer/components/Favicon'
import { Icon } from '@renderer/components/Icon'
import { useToast } from '@renderer/components/Toast'
import { childrenOf, useBookmarks } from '@renderer/hooks/useBookmarks'
import { call, fire } from '@renderer/lib/api'
import { PageFrame } from './PageFrame'

interface Row {
  item: Bookmark
  depth: number
}

type DropZone = 'before' | 'after' | 'inside'

function flatten(all: Bookmark[], collapsed: Set<string>, parentId: string | null = null, depth = 0): Row[] {
  return childrenOf(all, parentId).flatMap((item) => [
    { item, depth },
    ...(item.type === 'folder' && !collapsed.has(item.id) ? flatten(all, collapsed, item.id, depth + 1) : [])
  ])
}

const cleanError = (e: Error): string => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

type EditTarget = { kind: 'edit'; item: Bookmark } | { kind: 'folder' } | { kind: 'delete'; item: Bookmark }

export function BookmarksPage() {
  const { items: all, loading } = useBookmarks()
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<EditTarget | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ id: string; zone: DropZone } | null>(null)
  const { toast, node } = useToast()

  const rows = useMemo<Row[]>(() => {
    const needle = query.trim().toLowerCase()
    if (needle) {
      return all
        .filter((b) => b.type === 'bookmark' && (b.title.toLowerCase().includes(needle) || b.url.toLowerCase().includes(needle)))
        .map((item) => ({ item, depth: 0 }))
    }
    return flatten(all, collapsed)
  }, [all, collapsed, query])

  const toggle = (id: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const onDragOver = (e: DragEvent, item: Bookmark): void => {
    if (!dragId || dragId === item.id || query) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const y = (e.clientY - rect.top) / rect.height
    const zone: DropZone = item.type === 'folder' ? (y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside') : y < 0.5 ? 'before' : 'after'
    setDrop({ id: item.id, zone })
  }

  const finishDrop = (): void => {
    if (dragId && drop) {
      const target = all.find((b) => b.id === drop.id)
      if (target) {
        if (drop.zone === 'inside') {
          fire('bookmarks.move', dragId, target.id, 9999)
        } else {
          const siblings = childrenOf(all, target.parentId).filter((b) => b.id !== dragId)
          const at = siblings.findIndex((b) => b.id === target.id)
          fire('bookmarks.move', dragId, target.parentId, drop.zone === 'before' ? at : at + 1)
        }
      }
    }
    setDragId(null)
    setDrop(null)
  }

  const importFile = (): void => {
    call('bookmarks.import').then(
      (n) => n > 0 && toast(`Imported ${n} bookmark${n === 1 ? '' : 's'}`),
      (e: Error) => toast(cleanError(e), 'error')
    )
  }
  const exportFile = (): void => {
    call('bookmarks.export').then(
      (ok) => ok && toast('Bookmarks exported'),
      (e: Error) => toast(cleanError(e), 'error')
    )
  }

  const removeWithConfirm = (item: Bookmark): void => {
    if (item.type === 'folder' && childrenOf(all, item.id).length > 0) setDialog({ kind: 'delete', item })
    else fire('bookmarks.remove', item.id)
  }

  return (
    <PageFrame
      code="Bookmarks"
      title="Bookmarks"
      actions={
        <>
          <Button icon="folder" onClick={() => setDialog({ kind: 'folder' })}>
            New folder
          </Button>
          <Button icon="upload" variant="ghost" onClick={importFile}>
            Import
          </Button>
          <Button icon="download" variant="ghost" onClick={exportFile} disabled={all.length === 0}>
            Export
          </Button>
        </>
      }
      toolbar={
        <div className="pbar">
          <label className="pbar__search">
            <Icon name="search" size={14} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search bookmarks" aria-label="Search bookmarks" spellCheck={false} />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
                <Icon name="close" size={12} />
              </button>
            )}
          </label>
          <span className="pbar__hint mono">{query ? '' : 'DRAG TO REORDER · DROP ON A FOLDER TO MOVE INSIDE'}</span>
        </div>
      }
    >
      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="bookmark"
          title={query ? 'No matches' : 'No bookmarks yet'}
          hint={query ? `Nothing matches “${query}”.` : 'Press Ctrl+D on any page to bookmark it, or import a bookmarks file from another browser.'}
        >
          {!query && (
            <Button icon="upload" onClick={importFile}>
              Import bookmarks
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="bmlist" onDragLeave={(e) => e.currentTarget === e.target && setDrop(null)}>
          {rows.map(({ item, depth }) => (
            <div
              key={item.id}
              draggable={!query}
              className={[
                'bmrow',
                dragId === item.id && 'is-dragging',
                drop?.id === item.id && `drop-${drop.zone}`
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ paddingLeft: 8 + depth * 24 }}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', item.id)
                setDragId(item.id)
              }}
              onDragOver={(e) => onDragOver(e, item)}
              onDrop={(e) => {
                e.preventDefault()
                finishDrop()
              }}
              onDragEnd={finishDrop}
            >
              <span className="bmrow__grip">
                <Icon name="grip" size={14} />
              </span>
              {item.type === 'folder' ? (
                <button type="button" className="bmrow__main" onClick={() => toggle(item.id)}>
                  <Icon name={collapsed.has(item.id) ? 'chevronRight' : 'chevronDown'} size={12} />
                  <Icon name="folder" size={15} />
                  <span className="bmrow__title">{item.title}</span>
                  <span className="bmrow__count mono">{childrenOf(all, item.id).length}</span>
                </button>
              ) : (
                <a
                  className="bmrow__main"
                  href={item.url}
                  title={item.url}
                  onClick={(e) => {
                    e.preventDefault()
                    fire('page.navigate', item.url, { newTab: e.ctrlKey })
                  }}
                  onAuxClick={(e) => {
                    e.preventDefault()
                    if (e.button === 1) fire('page.navigate', item.url, { newTab: true })
                  }}
                >
                  <Favicon src={item.favicon} label={item.url} size={16} />
                  <span className="bmrow__title">{item.title}</span>
                  <span className="bmrow__url mono">{item.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
                </a>
              )}
              <span className="bmrow__actions">
                <button type="button" aria-label="Edit" title="Edit" onClick={() => setDialog({ kind: 'edit', item })}>
                  <Icon name="edit" size={13} />
                </button>
                <button type="button" aria-label="Delete" title="Delete" onClick={() => removeWithConfirm(item)}>
                  <Icon name="trash" size={13} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {dialog?.kind === 'edit' && <EditDialog item={dialog.item} onClose={() => setDialog(null)} onError={(m) => toast(m, 'error')} />}
      {dialog?.kind === 'folder' && <FolderDialog onClose={() => setDialog(null)} onError={(m) => toast(m, 'error')} />}
      {dialog?.kind === 'delete' && (
        <Dialog
          title="Delete folder"
          danger
          submitLabel="Delete"
          onClose={() => setDialog(null)}
          onSubmit={() => {
            fire('bookmarks.remove', dialog.item.id)
            setDialog(null)
          }}
        >
          <p className="dialog__text">“{dialog.item.title}” and everything inside it will be deleted.</p>
        </Dialog>
      )}
      {node}
    </PageFrame>
  )
}

function EditDialog({ item, onClose, onError }: { item: Bookmark; onClose: () => void; onError: (m: string) => void }) {
  const [title, setTitle] = useState(item.title)
  const [url, setUrl] = useState(item.url)
  const save = (): void => {
    call('bookmarks.update', item.id, item.type === 'folder' ? { title } : { title, url }).then(onClose, (e: Error) => onError(cleanError(e)))
  }
  return (
    <Dialog title={item.type === 'folder' ? 'Rename folder' : 'Edit bookmark'} onClose={onClose} onSubmit={save} submitDisabled={!title.trim() || (item.type === 'bookmark' && !url.trim())}>
      <Field label="Name">
        <input className="input" value={title} maxLength={200} autoFocus onChange={(e) => setTitle(e.target.value)} />
      </Field>
      {item.type === 'bookmark' && (
        <Field label="Address">
          <input className="input" value={url} spellCheck={false} onChange={(e) => setUrl(e.target.value)} />
        </Field>
      )}
    </Dialog>
  )
}

function FolderDialog({ onClose, onError }: { onClose: () => void; onError: (m: string) => void }) {
  const [title, setTitle] = useState('')
  return (
    <Dialog
      title="New folder"
      submitLabel="Create"
      onClose={onClose}
      submitDisabled={!title.trim()}
      onSubmit={() => call('bookmarks.folder', title.trim()).then(onClose, (e: Error) => onError(cleanError(e)))}
    >
      <Field label="Folder name">
        <input className="input" value={title} maxLength={200} autoFocus placeholder="e.g. Work" onChange={(e) => setTitle(e.target.value)} />
      </Field>
    </Dialog>
  )
}

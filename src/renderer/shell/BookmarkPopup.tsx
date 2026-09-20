import { useEffect, useMemo, useRef, useState } from 'react'
import type { Bookmark } from '@shared/types'
import { Button } from '@renderer/components/Controls'
import { childrenOf } from '@renderer/hooks/useBookmarks'
import { call, fire } from '@renderer/lib/api'

interface Props {
  bookmark: Bookmark
  all: Bookmark[]
  onClose: () => void
}

function folderOptions(all: Bookmark[], parentId: string | null = null, depth = 0): { id: string; label: string }[] {
  return childrenOf(all, parentId)
    .filter((b) => b.type === 'folder')
    .flatMap((f) => [{ id: f.id, label: `${'— '.repeat(depth)}${f.title}` }, ...folderOptions(all, f.id, depth + 1)])
}

/** Shown after Ctrl+D / star click: rename, move to a folder, or remove the bookmark. */
export function BookmarkPopup({ bookmark, all, onClose }: Props) {
  const [title, setTitle] = useState(bookmark.title)
  const [folder, setFolder] = useState(bookmark.parentId ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  const removed = useRef(false)
  const latest = useRef({ title, folder })
  latest.current = { title, folder }
  const folders = useMemo(() => folderOptions(all), [all])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    // commit edits whenever the popup goes away (Done, click outside, Esc)
    return () => {
      if (removed.current) return
      const { title: t, folder: f } = latest.current
      if (t.trim() && t.trim() !== bookmark.title) fire('bookmarks.update', bookmark.id, { title: t.trim() })
      if ((f || null) !== bookmark.parentId) fire('bookmarks.move', bookmark.id, f || null, 9999)
    }
  }, [bookmark.id, bookmark.parentId, bookmark.title])

  return (
    <section
      className="popup popup--bookmark"
      data-popup
      aria-label="Bookmark"
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClose()
      }}
    >
      <header className="popup__head">
        <span className="label">Bookmark</span>
        <span className="label popup__ok">Saved</span>
      </header>
      <div className="popup__body">
        <label className="field">
          <span className="label">Name</span>
          <input ref={inputRef} className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </label>
        <label className="field">
          <span className="label">Folder</span>
          <select className="input" value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="">Bookmarks</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <footer className="popup__foot">
        <Button
          variant="danger"
          icon="trash"
          onClick={() => {
            removed.current = true
            void call('bookmarks.remove', bookmark.id).finally(onClose)
          }}
        >
          Remove
        </Button>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </footer>
    </section>
  )
}

import type { MouseEvent } from 'react'
import type { Bookmark } from '@shared/types'
import { Favicon } from '@renderer/components/Favicon'
import { Icon } from '@renderer/components/Icon'
import { childrenOf } from '@renderer/hooks/useBookmarks'
import { fire } from '@renderer/lib/api'

interface Props {
  all: Bookmark[]
  onFolder: (folder: Bookmark, x: number, y: number) => void
  onContext: (item: Bookmark, x: number, y: number) => void
}

export function BookmarksBar({ all, onFolder, onContext }: Props) {
  const items = childrenOf(all, null)

  const open = (e: MouseEvent, item: Bookmark): void => {
    if (item.type === 'folder') {
      const rect = e.currentTarget.getBoundingClientRect()
      onFolder(item, rect.left, rect.bottom)
    } else {
      fire('nav.go', item.url, { newTab: e.ctrlKey || e.button === 1 })
    }
  }

  return (
    <div className="bmbar" data-popup-trigger>
      {items.length === 0 ? (
        <span className="bmbar__hint">Bookmarks appear here · press Ctrl+D on any page</span>
      ) : (
        items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="bmbar__item"
            title={item.type === 'folder' ? item.title : `${item.title}\n${item.url}`}
            onClick={(e) => open(e, item)}
            onAuxClick={(e) => e.button === 1 && open(e, item)}
            onContextMenu={(e) => {
              e.preventDefault()
              onContext(item, e.clientX, e.clientY)
            }}
          >
            {item.type === 'folder' ? <Icon name="folder" size={13} /> : <Favicon src={item.favicon} label={item.url} size={13} />}
            <span>{item.title}</span>
            {item.type === 'folder' && <Icon name="chevronDown" size={10} />}
          </button>
        ))
      )}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import type { Bookmark } from '@shared/types'
import { call, subscribe } from '@renderer/lib/api'

export function useBookmarks(): { items: Bookmark[]; loading: boolean; reload: () => void } {
  const [items, setItems] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(() => {
    call('bookmarks.tree').then(
      (list) => {
        setItems(list)
        setLoading(false)
      },
      () => setLoading(false)
    )
  }, [])

  useEffect(() => {
    reload()
    return subscribe('bookmarks:changed', reload)
  }, [reload])

  return { items, loading, reload }
}

export function childrenOf(all: Bookmark[], parentId: string | null): Bookmark[] {
  return all.filter((b) => b.parentId === parentId).sort((a, b) => a.position - b.position)
}

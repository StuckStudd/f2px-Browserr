import { useEffect, useMemo, useState } from 'react'
import type { DownloadRecord } from '@shared/types'
import { call, subscribe } from '@renderer/lib/api'

export interface DownloadsSummary {
  items: DownloadRecord[]
  loading: boolean
  active: DownloadRecord[]
  /** 0..1 across all running downloads, or null if none has a known size. */
  progress: number | null
}

/** Live list of downloads: initial snapshot + upsert/remove events from the main process. */
export function useDownloads(): DownloadsSummary {
  const [map, setMap] = useState<Map<string, DownloadRecord>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    call('downloads.list').then(
      (list) => {
        if (!alive) return
        setMap((prev) => {
          const next = new Map(prev)
          for (const r of list) if (!next.has(r.id)) next.set(r.id, r)
          return next
        })
        setLoading(false)
      },
      () => setLoading(false)
    )
    const offUpsert = subscribe('downloads:upsert', (record) =>
      setMap((prev) => new Map(prev).set(record.id, record))
    )
    const offRemove = subscribe('downloads:remove', (id) =>
      setMap((prev) => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
    )
    return () => {
      alive = false
      offUpsert()
      offRemove()
    }
  }, [])

  return useMemo(() => {
    const items = [...map.values()].sort((a, b) => b.startedAt - a.startedAt)
    const active = items.filter((r) => r.state === 'downloading' || r.state === 'paused')
    const known = active.filter((r) => r.totalBytes > 0)
    const total = known.reduce((s, r) => s + r.totalBytes, 0)
    const received = known.reduce((s, r) => s + r.receivedBytes, 0)
    return { items, loading, active, progress: total > 0 ? received / total : null }
  }, [map, loading])
}

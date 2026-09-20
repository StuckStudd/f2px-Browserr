import { useMemo, useState } from 'react'
import type { Settings } from '@shared/types'
import { Button, Segmented } from '@renderer/components/Controls'
import { DownloadRow } from '@renderer/components/DownloadRow'
import { EmptyState, Loading } from '@renderer/components/EmptyState'
import { useToast } from '@renderer/components/Toast'
import { useDownloads } from '@renderer/hooks/useDownloads'
import { fire } from '@renderer/lib/api'
import { formatSpeed } from '@renderer/lib/format'
import { PageFrame } from './PageFrame'

type Filter = 'all' | 'active' | 'done' | 'failed'

function destinationLabel(s: Settings): string {
  if (s.downloadMode === 'ask') return 'ASK EVERY TIME'
  if (s.downloadMode === 'custom' && s.downloadPath) return s.downloadPath
  return '%USERPROFILE%\\Downloads\\F2PX'
}

export function DownloadsPage({ settings }: { settings: Settings }) {
  const { items, loading, active } = useDownloads()
  const [filter, setFilter] = useState<Filter>('all')
  const { toast, node } = useToast()

  const shown = useMemo(
    () =>
      items.filter((r) => {
        if (filter === 'active') return r.state === 'downloading' || r.state === 'paused'
        if (filter === 'done') return r.state === 'completed'
        if (filter === 'failed') return r.state === 'failed' || r.state === 'cancelled'
        return true
      }),
    [items, filter]
  )
  const totalSpeed = active.reduce((sum, r) => sum + (r.state === 'downloading' ? r.speed : 0), 0)
  const finished = items.length - active.length

  return (
    <PageFrame
      code="Downloads"
      title="Downloads"
      actions={
        <Button icon="trash" disabled={finished === 0} onClick={() => fire('downloads.clearFinished')}>
          Clear finished
        </Button>
      }
      toolbar={
        <div className="pbar">
          <div className="pbar__info mono">
            <span className="label">Saving to</span>
            <span title={destinationLabel(settings)}>{destinationLabel(settings)}</span>
          </div>
          <div className="pbar__spacer" />
          {active.length > 0 && (
            <span className="pbar__live mono">
              {active.length} ACTIVE · {formatSpeed(totalSpeed)}
            </span>
          )}
          <Segmented
            label="Filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'done', label: 'Done' },
              { value: 'failed', label: 'Failed' }
            ]}
          />
        </div>
      }
    >
      {loading ? (
        <Loading />
      ) : shown.length === 0 ? (
        <EmptyState
          icon="download"
          title={items.length === 0 ? 'No downloads' : 'Nothing here'}
          hint={items.length === 0 ? 'Files you download appear here with live progress, speed and status.' : 'No downloads match this filter.'}
        />
      ) : (
        <div className="dllist">
          {shown.map((r) => (
            <DownloadRow key={r.id} record={r} onMessage={(m) => toast(m, 'error')} />
          ))}
        </div>
      )}
      {node}
    </PageFrame>
  )
}

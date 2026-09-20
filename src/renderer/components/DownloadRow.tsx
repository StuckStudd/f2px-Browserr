import type { DownloadRecord } from '@shared/types'
import { hostOf } from '@shared/url'
import { call, fire } from '@renderer/lib/api'
import { formatBytes, formatDateTime, formatEta, formatSpeed } from '@renderer/lib/format'
import { Button } from './Controls'
import { Icon } from './Icon'

const STATE_LABEL: Record<DownloadRecord['state'], string> = {
  downloading: 'Downloading',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled'
}

export function progressOf(r: DownloadRecord): number | null {
  if (r.state === 'completed') return 1
  return r.totalBytes > 0 ? Math.min(1, r.receivedBytes / r.totalBytes) : null
}

/** Segmented progress bar: thin cells like a technical readout. */
function ProgressBar({ value, state }: { value: number | null; state: DownloadRecord['state'] }) {
  const cells = 40
  const filled = value === null ? 0 : Math.round(value * cells)
  return (
    <div className={`dlbar dlbar--${state} ${value === null ? 'is-indeterminate' : ''}`} role="progressbar" aria-valuenow={value === null ? undefined : Math.round(value * 100)}>
      {Array.from({ length: cells }, (_, i) => (
        <span key={i} className={i < filled ? 'is-on' : ''} />
      ))}
    </div>
  )
}

interface Props {
  record: DownloadRecord
  compact?: boolean
  onMessage?: (text: string) => void
}

export function DownloadRow({ record: r, compact = false, onMessage }: Props) {
  const progress = progressOf(r)
  const running = r.state === 'downloading' || r.state === 'paused'
  const remaining = r.speed > 0 && r.totalBytes > 0 ? (r.totalBytes - r.receivedBytes) / r.speed : NaN

  const open = (): void => {
    call('downloads.open', r.id).then(
      (error) => error && onMessage?.(error),
      (e: Error) => onMessage?.(e.message)
    )
  }

  return (
    <article className={`dl dl--${r.state} ${compact ? 'dl--compact' : ''}`}>
      <div className="dl__head">
        <Icon name="file" size={14} />
        <span className="dl__name" title={r.filename}>
          {r.filename}
        </span>
        <span className={`chip chip--${r.state}`}>{STATE_LABEL[r.state]}</span>
      </div>

      {running && (
        <>
          <div className="dl__progress">
            <ProgressBar value={progress} state={r.state} />
            <span className="dl__percent mono">{progress === null ? '—' : `${Math.floor(progress * 100)}%`}</span>
          </div>
          <div className="dl__stats mono">
            <span>
              {formatBytes(r.receivedBytes)}
              {r.totalBytes > 0 && ` / ${formatBytes(r.totalBytes)}`}
            </span>
            {r.state === 'downloading' && <span>{formatSpeed(r.speed)}</span>}
            {r.state === 'downloading' && Number.isFinite(remaining) && <span>{formatEta(remaining)} left</span>}
          </div>
        </>
      )}

      {!running && (
        <div className="dl__stats mono">
          <span>{r.state === 'completed' || r.totalBytes ? formatBytes(r.totalBytes || r.receivedBytes) : '—'}</span>
          <span>{formatDateTime(r.endedAt ?? r.startedAt)}</span>
          {r.error && r.state === 'failed' && <span className="dl__error">{r.error}</span>}
        </div>
      )}

      {!compact && (
        <dl className="dl__meta mono">
          <dt>SOURCE</dt>
          <dd title={r.url}>{hostOf(r.url) || hostOf(r.source) || r.url}</dd>
          {r.savePath && (
            <>
              <dt>PATH</dt>
              <dd title={r.savePath}>{r.savePath}</dd>
            </>
          )}
        </dl>
      )}

      <div className="dl__actions">
        {r.state === 'downloading' && (
          <Button icon="pause" onClick={() => fire('downloads.pause', r.id)}>
            Pause
          </Button>
        )}
        {r.state === 'paused' && (
          <Button icon="play" onClick={() => fire('downloads.resume', r.id)}>
            Resume
          </Button>
        )}
        {running && (
          <Button variant="ghost" icon="close" onClick={() => fire('downloads.cancel', r.id)}>
            Cancel
          </Button>
        )}
        {(r.state === 'failed' || r.state === 'cancelled') && (
          <Button icon="reload" onClick={() => fire('downloads.retry', r.id)}>
            Retry
          </Button>
        )}
        {r.state === 'completed' && (
          <>
            <Button icon="external" onClick={open}>
              Open
            </Button>
            <Button variant="ghost" icon="folder" onClick={() => fire('downloads.show', r.id)}>
              {compact ? 'Folder' : 'Show in folder'}
            </Button>
          </>
        )}
        {!running && (
          <Button variant="ghost" icon="trash" className="dl__remove" onClick={() => fire('downloads.remove', r.id)} aria-label="Remove from history">
            {compact ? undefined : 'Remove'}
          </Button>
        )}
      </div>
    </article>
  )
}

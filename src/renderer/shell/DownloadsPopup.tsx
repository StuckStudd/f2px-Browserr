import { DownloadRow } from '@renderer/components/DownloadRow'
import { Button } from '@renderer/components/Controls'
import { Icon } from '@renderer/components/Icon'
import type { DownloadsSummary } from '@renderer/hooks/useDownloads'
import { fire } from '@renderer/lib/api'

export function DownloadsPopup({ downloads, onClose }: { downloads: DownloadsSummary; onClose: () => void }) {
  const recent = downloads.items.slice(0, 6)
  return (
    <section className="popup popup--downloads" data-popup aria-label="Downloads">
      <header className="popup__head">
        <span className="label">Downloads{downloads.items.length > 0 ? ` · ${downloads.items.length}` : ''}</span>
        <div className="popup__head-actions">
          <Button
            variant="ghost"
            icon="external"
            onClick={() => {
              fire('ui.openPage', 'downloads')
              onClose()
            }}
          >
            Open page
          </Button>
        </div>
      </header>
      <div className="popup__scroll">
        {recent.length === 0 ? (
          <div className="popup__empty">
            <Icon name="download" size={18} />
            <span className="label">No downloads yet</span>
          </div>
        ) : (
          recent.map((r) => <DownloadRow key={r.id} record={r} compact />)
        )}
      </div>
    </section>
  )
}

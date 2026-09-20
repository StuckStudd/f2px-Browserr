import { forwardRef, type ReactNode } from 'react'
import type { ShellState, TabInfo } from '@shared/types'
import { Icon, type IconName } from '@renderer/components/Icon'
import type { DownloadsSummary } from '@renderer/hooks/useDownloads'
import { fire } from '@renderer/lib/api'
import { LoadingBar } from './LoadingBar'
import { Omnibox, type OmniboxHandle } from './Omnibox'

interface ToolButtonProps {
  icon: IconName
  label: string
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  children?: ReactNode
  popupTrigger?: boolean
}

export const ToolButton = forwardRef<HTMLButtonElement, ToolButtonProps>(function ToolButton(
  { icon, label, onClick, disabled, active, children, popupTrigger },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`tbtn ${active ? 'is-active' : ''}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      {...(popupTrigger ? { 'data-popup-trigger': true } : {})}
    >
      <Icon name={icon} size={16} />
      {children}
    </button>
  )
})

interface ToolbarProps {
  state: ShellState
  tab: TabInfo | null
  downloads: DownloadsSummary
  downloadsFlash: boolean
  downloadsOpen: boolean
  menuOpen: boolean
  omniboxRef: React.RefObject<OmniboxHandle | null>
  onOmniboxOpen: (open: boolean) => void
  onStar: () => void
  onToggleDownloads: () => void
  onToggleMenu: () => void
}

export function Toolbar(props: ToolbarProps) {
  const { state, tab, downloads, downloadsFlash, downloadsOpen, menuOpen } = props
  const loading = !!tab?.loading
  const running = downloads.active.length

  return (
    <div className="toolbar">
      <div className="toolbar__group">
        <ToolButton icon="back" label="Back (Alt+←)" disabled={!tab?.canGoBack} onClick={() => fire('nav.back')} />
        <ToolButton icon="forward" label="Forward (Alt+→)" disabled={!tab?.canGoForward} onClick={() => fire('nav.forward')} />
        <ToolButton
          icon={loading ? 'close' : 'reload'}
          label={loading ? 'Stop loading' : 'Reload (Ctrl+R)'}
          onClick={() => (loading ? fire('nav.stop') : fire('nav.reload', false))}
        />
        <ToolButton icon="home" label="Home (Alt+Home)" onClick={() => fire('nav.home')} />
      </div>

      <Omnibox
        ref={props.omniboxRef}
        tab={tab}
        bookmarked={state.bookmarked}
        zoomPercent={state.zoomPercent}
        blocked={tab?.blocked ?? 0}
        onOpenChange={props.onOmniboxOpen}
        onStar={props.onStar}
      />

      <div className="toolbar__group">
        <ToolButton
          icon="download"
          label="Downloads (Ctrl+J)"
          active={downloadsOpen}
          popupTrigger
          onClick={props.onToggleDownloads}
        >
          {running > 0 && (
            <span className="tbtn__progress" style={{ ['--p' as string]: `${Math.round((downloads.progress ?? 0.05) * 100)}%` }} />
          )}
          {running > 0 && <span className="tbtn__count">{running}</span>}
          {downloadsFlash && <span className="tbtn__flash" />}
        </ToolButton>
        <ToolButton icon="history" label="History (Ctrl+H)" onClick={() => fire('ui.openPage', 'history')} />
        <ToolButton icon="settings" label="Settings (Ctrl+,)" onClick={() => fire('ui.openPage', 'settings')} />
        <ToolButton icon="dots" label="Menu" active={menuOpen} popupTrigger onClick={props.onToggleMenu} />
      </div>
      <LoadingBar loading={loading} tabId={tab?.id ?? null} />
    </div>
  )
}

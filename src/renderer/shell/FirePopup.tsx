import { useState } from 'react'
import type { FireOptions } from '@shared/types'
import { Button, Checkbox } from '@renderer/components/Controls'
import { Icon } from '@renderer/components/Icon'
import { call } from '@renderer/lib/api'

const OPTIONS: { key: keyof FireOptions; label: string; hint: string }[] = [
  { key: 'tabs', label: 'Tabs and windows', hint: 'Everything is closed; one empty window remains' },
  { key: 'history', label: 'Browsing history', hint: 'Including the saved session' },
  { key: 'cookies', label: 'Cookies & site data', hint: 'Signs you out everywhere, in every kind of window' },
  { key: 'cache', label: 'Cached files', hint: '' },
  { key: 'downloads', label: 'Download list', hint: 'The files themselves stay on disk' },
  { key: 'permissions', label: 'Site permissions', hint: 'Remembered camera, microphone and notification answers' }
]

/** "Fire": one action that leaves nothing behind — and gives every site a brand-new fingerprint identity. */
export function FirePopup({ onClose }: { onClose: () => void }) {
  const [options, setOptions] = useState<FireOptions>({ tabs: true, history: true, downloads: true, cookies: true, cache: true, permissions: true })
  const [busy, setBusy] = useState(false)
  const any = Object.values(options).some(Boolean)

  const burn = (): void => {
    setBusy(true)
    // the window that asks is usually closed by the answer, so there is nothing to wait for
    void call('privacy.fire', options).then(onClose, onClose)
  }

  return (
    <section className="popup popup--fire" data-popup aria-label="Fire">
      <header className="popup__head">
        <span className="label">
          <Icon name="flame" size={12} /> Fire
        </span>
        <span className="popup__hint mono">Ctrl+Shift+Del</span>
      </header>
      <div className="popup__body">
        <p className="shield__note">Erases what you choose and starts over. Sites will not recognise you afterwards: every site also gets a new fingerprint identity.</p>
        <div className="fire__options">
          {OPTIONS.map((o) => (
            <Checkbox key={o.key} checked={options[o.key]} onChange={(value) => setOptions({ ...options, [o.key]: value })}>
              <span className="fire__label">{o.label}</span>
              {o.hint && <span className="fire__hint">{o.hint}</span>}
            </Checkbox>
          ))}
        </div>
      </div>
      <footer className="popup__foot">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" icon="flame" disabled={!any || busy} onClick={burn}>
          {busy ? 'Clearing…' : 'Clear and restart'}
        </Button>
      </footer>
    </section>
  )
}

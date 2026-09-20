import { useRef, useState } from 'react'
import type { QuickAccessItem } from '@shared/types'
import { normalizeWebUrl } from '@shared/url'
import { Button, Segmented } from '@renderer/components/Controls'
import { Dialog, Field } from '@renderer/components/Dialog'
import { call } from '@renderer/lib/api'

type IconMode = 'auto' | 'text' | 'image'

interface Props {
  item: QuickAccessItem | null
  onClose: () => void
  onSaved: () => void
  onError: (message: string) => void
}

/** Squares an arbitrary image to 64x64 and returns a PNG data URL (kept small in the database). */
async function imageToDataUrl(file: File, size = 64): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Could not read this image'))
      el.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not available')
    const scale = Math.min(size / img.width, size / img.height)
    const w = img.width * scale
    const h = img.height * scale
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

function initialMode(icon: string): IconMode {
  if (icon.startsWith('text:')) return 'text'
  return icon ? 'image' : 'auto'
}

export function QuickAccessDialog({ item, onClose, onSaved, onError }: Props) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [url, setUrl] = useState(item?.url ?? '')
  const [mode, setMode] = useState<IconMode>(initialMode(item?.icon ?? ''))
  const [text, setText] = useState(item?.icon.startsWith('text:') ? item.icon.slice(5) : '')
  const [image, setImage] = useState(item && initialMode(item.icon) === 'image' ? item.icon : '')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const validUrl = normalizeWebUrl(url) !== null
  const icon = mode === 'text' ? (text.trim() ? `text:${text.trim().slice(0, 3)}` : '') : mode === 'image' ? image : ''

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      if (item) await call('quickAccess.update', item.id, { title, url, icon })
      else await call('quickAccess.add', { title, url, icon })
      onSaved()
      onClose()
    } catch (error) {
      onError(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not save')
      setSaving(false)
    }
  }

  return (
    <Dialog
      title={item ? 'Edit shortcut' : 'New shortcut'}
      onClose={onClose}
      onSubmit={() => void save()}
      submitLabel={item ? 'Save' : 'Add'}
      submitDisabled={!validUrl || saving}
    >
      <Field label="Name">
        <input className="input" value={title} maxLength={40} placeholder="e.g. Wikipedia" autoFocus onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Address" hint={url && !validUrl ? 'Enter a valid http(s) address' : undefined}>
        <input className="input" value={url} placeholder="example.com" spellCheck={false} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <div className="field">
        <span className="label">Icon</span>
        <Segmented
          label="Icon type"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'text', label: 'Letters' },
            { value: 'image', label: 'Image' }
          ]}
        />
        {mode === 'text' && (
          <input className="input" value={text} maxLength={3} placeholder="1–3 characters" onChange={(e) => setText(e.target.value)} />
        )}
        {mode === 'image' && (
          <div className="qa-dialog__image">
            <span className="qa__icon qa__icon--preview">{image ? <img className="qa__img" src={image} alt="" /> : null}</span>
            <Button icon="image" onClick={() => fileRef.current?.click()}>
              Choose file
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) imageToDataUrl(file).then(setImage, (err: Error) => onError(err.message))
                e.target.value = ''
              }}
            />
          </div>
        )}
      </div>
    </Dialog>
  )
}

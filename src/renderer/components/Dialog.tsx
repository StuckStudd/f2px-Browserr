import { useEffect, type ReactNode } from 'react'
import { Button } from './Controls'

interface DialogProps {
  title: string
  children: ReactNode
  onClose: () => void
  onSubmit?: () => void
  submitLabel?: string
  submitDisabled?: boolean
  danger?: boolean
}

export function Dialog({ title, children, onClose, onSubmit, submitLabel = 'Save', submitDisabled, danger }: DialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        role="dialog"
        aria-label={title}
        onSubmit={(e) => {
          e.preventDefault()
          if (!submitDisabled) onSubmit?.()
        }}
      >
        <header className="dialog__head">
          <span className="label">{title}</span>
        </header>
        <div className="dialog__body">{children}</div>
        <footer className="dialog__foot">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {onSubmit && (
            <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={submitDisabled}>
              {submitLabel}
            </Button>
          )}
        </footer>
      </form>
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  )
}

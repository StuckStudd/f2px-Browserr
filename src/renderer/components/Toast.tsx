import { useCallback, useRef, useState, type ReactNode } from 'react'

export interface ToastState {
  id: number
  text: string
  tone: 'info' | 'error'
}

/** Tiny toast helper: `const { toast, node } = useToast()`; render `node` once in the page. */
export function useToast(): { toast: (text: string, tone?: ToastState['tone']) => void; node: ReactNode } {
  const [current, setCurrent] = useState<ToastState | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const toast = useCallback((text: string, tone: ToastState['tone'] = 'info') => {
    window.clearTimeout(timer.current)
    setCurrent({ id: Date.now(), text, tone })
    timer.current = window.setTimeout(() => setCurrent(null), 3200)
  }, [])

  const node = current ? (
    <div key={current.id} className={`toast toast--${current.tone}`} role="status">
      {current.text}
    </div>
  ) : null
  return { toast, node }
}

import { useEffect, useState } from 'react'

type Phase = 'idle' | 'loading' | 'finishing'

/**
 * Thin progress line under the toolbar. Chromium does not report load percentage,
 * so the bar crawls asymptotically while loading and snaps to 100% when the page settles.
 */
export function LoadingBar({ loading, tabId }: { loading: boolean; tabId: number | null }) {
  const [phase, setPhase] = useState<Phase>('idle')

  useEffect(() => {
    if (loading) {
      setPhase('loading')
      return
    }
    setPhase((p) => (p === 'loading' ? 'finishing' : 'idle'))
    const timer = window.setTimeout(() => setPhase('idle'), 380)
    return () => window.clearTimeout(timer)
  }, [loading, tabId])

  return <div className={`loadbar loadbar--${phase}`} key={`${tabId}-${phase === 'loading'}`} aria-hidden="true" />
}

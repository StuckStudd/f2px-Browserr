import { useCallback, useEffect, useState } from 'react'
import type { Settings } from '@shared/types'
import { call, fire, subscribe } from '@renderer/lib/api'

/** Live view of the user's settings; changes made anywhere (other tabs, other windows) flow in. */
export function useSettings(): [Settings | null, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    let alive = true
    call('settings.get').then((s) => alive && setSettings(s), console.error)
    const off = subscribe('settings:changed', (s) => setSettings(s))
    return () => {
      alive = false
      off()
    }
  }, [])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev)) // optimistic
    fire('settings.update', patch)
  }, [])

  return [settings, update]
}

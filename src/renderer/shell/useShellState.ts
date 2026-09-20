import { useEffect, useState } from 'react'
import type { ShellState } from '@shared/types'
import { call, subscribe } from '@renderer/lib/api'

export function useShellState(): ShellState | null {
  const [state, setState] = useState<ShellState | null>(null)
  useEffect(() => {
    let alive = true
    call('shell.state').then((s) => alive && setState((prev) => prev ?? s), console.error)
    const off = subscribe('shell:state', setState)
    return () => {
      alive = false
      off()
    }
  }, [])
  return state
}

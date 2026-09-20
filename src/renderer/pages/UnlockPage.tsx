import { useEffect, useRef, useState } from 'react'
import { Button } from '@renderer/components/Controls'
import { LogoMark } from '@renderer/components/Logo'

interface UnlockApi {
  submit(password: string): Promise<boolean>
  reset(): Promise<boolean>
}

const api = (): UnlockApi | undefined => (window as unknown as { f2pxUnlock?: UnlockApi }).f2pxUnlock

/** Startup password window. Uses its own two-method bridge; the normal F2PX bridge is not available here. */
export function UnlockPage() {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => input.current?.focus(), [])

  const submit = async (): Promise<void> => {
    if (!password || busy) return
    setBusy(true)
    setError('')
    try {
      const ok = await api()?.submit(password)
      if (!ok) {
        setError('Wrong password')
        setPassword('')
        input.current?.focus()
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lock">
      <div className="lock__frame" aria-hidden="true" />
      <form
        className="lock__card"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="lock__mark">
          <LogoMark size={56} />
        </div>
        <h1 className="lock__title">F2PX</h1>
        <p className="label lock__sub">Locked</p>

        {!confirmReset ? (
          <>
            <label className="lock__field">
              <span className="label">Password</span>
              <input
                ref={input}
                className="input"
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!error}
              />
            </label>
            <div className="lock__error" role="alert">
              {error}
            </div>
            <Button type="submit" variant="primary" disabled={!password || busy}>
              {busy ? 'Checking…' : 'Unlock'}
            </Button>
            <button type="button" className="lock__link" onClick={() => setConfirmReset(true)}>
              Forgot password?
            </button>
          </>
        ) : (
          <div className="lock__reset">
            <p>
              Your data is encrypted with this password and <b>cannot be recovered without it</b>. You can erase all F2PX data (history, bookmarks,
              settings) and start fresh.
            </p>
            <Button variant="danger" onClick={() => void api()?.reset()}>
              Erase everything and start fresh
            </Button>
            <button type="button" className="lock__link" onClick={() => setConfirmReset(false)}>
              Back
            </button>
          </div>
        )}
      </form>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { hostOf } from '@shared/url'
import { call } from '@renderer/lib/api'

interface FaviconProps {
  src: string | null | undefined
  /** Text used for the monogram fallback (title or URL). */
  label: string
  size?: number
  className?: string
}

/**
 * Monogram used whenever an icon is missing: two mono letters in a thin frame.
 * URLs use the registrable name ("x.com" -> "X"), plain titles use initials ("Hacker News" -> "HN").
 */
export function monogram(label: string): string {
  const host = hostOf(label)
  let text = label
  if (host) {
    const parts = host.split('.')
    text = /^[\d.:]+$/.test(host) ? 'ip' : parts.length > 1 ? parts[parts.length - 2] : parts[0]
  }
  const words = text.split(/[\s._-]+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '').slice(0, 2)
  return (letters || '·').toUpperCase()
}

/**
 * Site icons are never loaded by the interface itself: the browser UI has no network access. Remote icons are fetched by the
 * main process (through the same proxy / Tor route as the window, without cookies or Referer) and arrive as data URLs.
 */
const remote = new Map<string, Promise<string | null>>()

function useIconSource(src: string | null | undefined): string | null {
  const isRemote = !!src && /^https?:\/\//i.test(src)
  const [resolved, setResolved] = useState<string | null>(() => (src && !isRemote ? src : null))

  useEffect(() => {
    if (!src) {
      setResolved(null)
      return
    }
    if (!isRemote) {
      setResolved(src)
      return
    }
    let alive = true
    setResolved(null)
    let job = remote.get(src)
    if (!job) {
      job = call('favicons.data', src).catch(() => null)
      remote.set(src, job)
      // keep the cache small; a failed lookup may be retried on the next view
      void job.then((value) => {
        if (value === null) remote.delete(src)
        if (remote.size > 400) remote.delete(remote.keys().next().value as string)
      })
    }
    void job.then((value) => alive && setResolved(value))
    return () => {
      alive = false
    }
  }, [src, isRemote])

  return resolved
}

export function Favicon({ src, label, size = 16, className }: FaviconProps) {
  const [failed, setFailed] = useState(false)
  const resolved = useIconSource(src)
  useEffect(() => setFailed(false), [src])

  if (resolved && !failed) {
    return (
      <img
        className={`favicon ${className ?? ''}`}
        src={resolved}
        width={size}
        height={size}
        alt=""
        draggable={false}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <span className={`favicon favicon--mono ${className ?? ''}`} style={{ width: size, height: size, fontSize: Math.max(7, size * 0.5) }} aria-hidden="true">
      {monogram(label)}
    </span>
  )
}

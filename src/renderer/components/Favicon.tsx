import { useEffect, useState } from 'react'
import { hostOf } from '@shared/url'

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

export function Favicon({ src, label, size = 16, className }: FaviconProps) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])

  if (src && !failed) {
    return (
      <img
        className={`favicon ${className ?? ''}`}
        src={src}
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

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1)
  const value = bytes / 1024 ** i
  return `${value.toFixed(i === 0 ? 0 : digits)} ${UNITS[i]}`
}

export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`
}

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m ${Math.round(seconds % 60)}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export function formatClock(date: Date, hour12 = false): string {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12 })
}

export function formatDateTime(ms: number): string {
  const d = new Date(ms)
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${formatClock(d)}`
}

const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** "TODAY", "YESTERDAY" or "MON, 12 SEP 2026" — used for history groups. */
export function dayLabel(ms: number, now = new Date()): string {
  const diffDays = Math.round((startOfDay(now) - startOfDay(new Date(ms))) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export function dayKey(ms: number): string {
  return String(startOfDay(new Date(ms)))
}

export function greeting(hour: number): string {
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

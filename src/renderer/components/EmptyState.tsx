import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export function EmptyState({ icon, title, hint, children }: { icon: IconName; title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__mark">
        <Icon name={icon} size={22} />
      </div>
      <div className="empty__title">{title}</div>
      {hint && <div className="empty__hint">{hint}</div>}
      {children}
    </div>
  )
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="loading__bar" />
      <span className="label">{label}</span>
    </div>
  )
}

import type { ReactNode } from 'react'

interface PageFrameProps {
  /** Short code shown in the breadcrumb: `F2PX / HISTORY`. */
  code: string
  title: string
  actions?: ReactNode
  children: ReactNode
  toolbar?: ReactNode
}

/** Common frame of the utility pages (history, downloads, bookmarks, settings). */
export function PageFrame({ code, title, actions, toolbar, children }: PageFrameProps) {
  return (
    <div className="page">
      <div className="page__bg" aria-hidden="true" />
      <div className="page__inner">
        <header className="page__head">
          <div>
            <div className="label page__crumb">F2PX / {code}</div>
            <h1 className="page__title">{title}</h1>
          </div>
          {actions && <div className="page__actions">{actions}</div>}
        </header>
        <div className="page__rule" />
        {toolbar && <div className="page__toolbar">{toolbar}</div>}
        {children}
      </div>
    </div>
  )
}

import type { ReactNode } from 'react'

/** One labelled setting: text on the left, the control on the right. Shared by Settings and the Privacy center. */
export function Row({ label, hint, children, stack }: { label: string; hint?: string; children?: ReactNode; stack?: boolean }) {
  return (
    <div className={`srow ${stack ? 'srow--stack' : ''}`}>
      <div className="srow__text">
        <div className="srow__label">{label}</div>
        {hint && <div className="srow__hint">{hint}</div>}
      </div>
      {children && <div className="srow__control">{children}</div>}
    </div>
  )
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="ssec" id={`sec-${id}`} data-section={id}>
      <h2 className="ssec__title">
        <span className="label">{title}</span>
        <span className="ssec__line" />
      </h2>
      {children}
    </section>
  )
}

/** Turns "Error invoking remote method 'x': Error: message" into "message". */
export const cleanError = (e: Error): string => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

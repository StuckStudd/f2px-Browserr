import type { WebContents } from 'electron'
import { EVENT_CHANNEL, type EventMap, type EventName } from '../../shared/ipc'
import { isInternalUrl } from '../../shared/url'

type Kind = 'shell' | 'page'

export interface EmitFilter {
  /** true -> only private windows, false -> only regular windows, undefined -> everyone. */
  isPrivate?: boolean
  kind?: Kind
}

/** Fan-out of main-process events to the shell UI and to open f2px:// pages. */
export class EventHub {
  private readonly targets = new Map<number, { contents: WebContents; kind: Kind }>()
  /** Resolves whether the window owning a webContents is a private window. */
  privacyOf: (contents: WebContents) => boolean = () => false

  subscribe(contents: WebContents, kind: Kind): void {
    if (this.targets.has(contents.id)) return
    this.targets.set(contents.id, { contents, kind })
    contents.once('destroyed', () => this.targets.delete(contents.id))
  }

  emit<E extends EventName>(name: E, payload?: EventMap[E], filter: EmitFilter = {}): void {
    for (const [id, target] of this.targets) {
      const { contents, kind } = target
      if (contents.isDestroyed()) {
        this.targets.delete(id)
        continue
      }
      if (filter.kind && filter.kind !== kind) continue
      // A tab that navigated away from f2px:// no longer receives internal data.
      if (kind === 'page' && !isInternalUrl(contents.getURL())) continue
      if (filter.isPrivate !== undefined && this.privacyOf(contents) !== filter.isPrivate) continue
      this.send(contents, name, payload)
    }
  }

  send<E extends EventName>(contents: WebContents, name: E, payload?: EventMap[E]): void {
    if (contents.isDestroyed()) return
    try {
      contents.send(EVENT_CHANNEL, name, payload)
    } catch {
      /* the frame is being torn down */
    }
  }
}

type Listener<T> = (payload: T) => void

/** Minimal typed event emitter for main-process services. */
export class Emitter<T = void> {
  private listeners = new Set<Listener<T>>()

  on(listener: Listener<T>): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(payload: T): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(payload)
      } catch (error) {
        console.error('[emitter] listener failed', error)
      }
    }
  }
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: NodeJS.Timeout | undefined
  return (...args: A) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

export function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let last = 0
  let timer: NodeJS.Timeout | undefined
  let pending: A | undefined
  return (...args: A) => {
    const now = Date.now()
    pending = args
    if (now - last >= ms) {
      last = now
      fn(...args)
      pending = undefined
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = undefined
        last = Date.now()
        if (pending) fn(...pending)
        pending = undefined
      }, ms - (now - last))
    }
  }
}

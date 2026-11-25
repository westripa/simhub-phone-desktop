import { flushSync } from 'react-dom'

export type TransitionKind = 'view' | 'theme' | 'call' | 'filter'

interface ViewTransitionHandle {
  finished?: Promise<unknown>
}

type DocumentWithTransition = Document & {
  startViewTransition?: (callback: () => void) => ViewTransitionHandle | void
}

let activeSeq = 0

/**
 * Wraps React state updates in the browser View Transitions API when supported
 * and motion is enabled, falling back cleanly to a direct update in tests/SSR.
 */
export function runViewTransition(
  update: () => void,
  kind: TransitionKind = 'view',
  onCleanup?: () => void,
): void {
  if (typeof document === 'undefined') {
    update()
    onCleanup?.()
    return
  }
  const reduced = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const doc = document as DocumentWithTransition
  if (reduced || typeof doc.startViewTransition !== 'function') {
    update()
    onCleanup?.()
    return
  }
  const root = document.documentElement
  const seq = ++activeSeq
  root.dataset.transition = kind
  const cleanup = () => {
    if (activeSeq === seq && root.dataset.transition === kind) {
      delete root.dataset.transition
    }
    onCleanup?.()
  }
  try {
    const handle = doc.startViewTransition(() => {
      flushSync(update)
    })
    if (handle && typeof handle.finished?.finally === 'function') {
      void handle.finished.finally(cleanup)
    } else {
      setTimeout(cleanup, 400)
    }
  } catch {
    cleanup()
    update()
  }
}

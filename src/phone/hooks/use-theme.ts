import { useCallback, useState } from 'react'
import { runViewTransition } from '../view-transition'

export type Theme = 'dark' | 'light'

export interface ThemeToggleOrigin {
  clientX?: number
  clientY?: number
  currentTarget?: EventTarget | null
}

function resolveOrigin(event?: ThemeToggleOrigin): { x: number; y: number; r: number } {
  const width = typeof window !== 'undefined' ? window.innerWidth : 1024
  const height = typeof window !== 'undefined' ? window.innerHeight : 768
  let x = width - 48
  let y = 18

  if (event && typeof event.clientX === 'number' && typeof event.clientY === 'number' && (event.clientX > 0 || event.clientY > 0)) {
    x = event.clientX
    y = event.clientY
  } else if (event?.currentTarget instanceof HTMLElement) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width > 0 || rect.height > 0) {
      x = rect.left + rect.width / 2
      y = rect.top + rect.height / 2
    }
  }

  const r = Math.hypot(Math.max(x, width - x), Math.max(y, height - y))
  return { x, y, r }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  ))

  const toggleTheme = useCallback((event?: ThemeToggleOrigin) => {
    const root = document.documentElement
    const next: Theme = root.classList.contains('dark') ? 'light' : 'dark'
    const { x, y, r } = resolveOrigin(event)

    root.style.setProperty('--vt-x', `${x}px`)
    root.style.setProperty('--vt-y', `${y}px`)
    root.style.setProperty('--vt-r', `${r}px`)

    runViewTransition(
      () => {
        root.classList.toggle('dark', next === 'dark')
        const meta = document.querySelector('meta[name="theme-color"]')
        if (meta) meta.setAttribute('content', next === 'dark' ? '#0c0d10' : '#ffffff')
        setTheme(next)
      },
      'theme',
      () => {
        root.style.removeProperty('--vt-x')
        root.style.removeProperty('--vt-y')
        root.style.removeProperty('--vt-r')
      },
    )
  }, [])

  return { theme, toggleTheme }
}

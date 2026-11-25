import { useEffect, useRef } from 'react'
import type { Call } from '../types'

export function usePhoneShortcuts(options: {
  blocked: boolean
  call: Call | null
  onDial: () => void
  onAnswer: () => void
  onHangup: () => void
  onDigit: (digit: string) => void
  onDtmf?: (digit: string) => void
  onMute: () => void
  onHold?: () => void
  onErase: () => void
}) {
  const latest = useRef(options)
  latest.current = options
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const { blocked, call, onDial, onAnswer, onHangup, onDigit, onDtmf, onMute, onHold, onErase } = latest.current
      if (blocked || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable], [role="listbox"], [role="dialog"], [role="slider"]')) return
      if (event.key === 'Escape' && call) { event.preventDefault(); onHangup() }
      else if (event.key === 'Enter' && target?.tagName !== 'BUTTON') {
        event.preventDefault()
        if (call?.phase === 'incoming') onAnswer()
        else if (!call) onDial()
      } else if (call?.phase === 'connected' && (event.key === 'm' || event.key === 'M') && target?.tagName !== 'BUTTON') {
        event.preventDefault()
        onMute()
      } else if (call?.phase === 'connected' && (event.key === 'h' || event.key === 'H') && target?.tagName !== 'BUTTON') {
        event.preventDefault()
        onHold?.()
      } else if (call?.phase === 'connected' && /^[0-9*#]$/.test(event.key) && target?.tagName !== 'BUTTON') {
        event.preventDefault()
        onDtmf?.(event.key)
      } else if (!call && /^[0-9+]$/.test(event.key)) { event.preventDefault(); onDigit(event.key) }
      else if (!call && event.key === 'Backspace') { event.preventDefault(); onErase() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}

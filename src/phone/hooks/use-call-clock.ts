import { useEffect, useState } from 'react'
import { formatDuration } from '../types'

export function useCallClock(answered?: number): string | null {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!answered) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [answered])

  return answered ? formatDuration((now - answered) / 1000) : null
}

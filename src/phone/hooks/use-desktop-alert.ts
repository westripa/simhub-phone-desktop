import { useEffect, useRef } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import type { Call, History } from '../types'

export function buildIncomingAlertText(call: Call): { title: string; body: string } {
  const title = call.transferSource === 'ai'
    ? `AI 转接来电 · ${call.peer}`
    : `来电 · ${call.peer}`
  const parts = [
    call.ownNumber ? `打给本机：${call.ownNumber}` : '',
    call.transferReason ? `转接原因：${call.transferReason}` : '点击唤醒窗口接听',
  ].filter(Boolean)
  return { title, body: parts.join(' · ') }
}

export async function notifyDesktopEvent(
  title: string,
  body: string,
  options?: { urgent?: boolean; tag?: string; onClick?: () => void },
): Promise<(() => void) | undefined> {
  if (isTauri()) {
    const handled = await invoke<boolean>('send_os_notification', {
      title,
      body,
      urgent: !!options?.urgent,
    }).catch(() => false)
    if (handled) return undefined
  }

  if (typeof Notification === 'undefined') return undefined
  if (Notification.permission === 'default') {
    const granted = await Notification.requestPermission().catch(() => 'denied')
    if (granted !== 'granted') return undefined
  } else if (Notification.permission !== 'granted') {
    return undefined
  }

  const notification = new Notification(title, {
    body,
    tag: options?.tag,
    requireInteraction: !!options?.urgent,
  })
  notification.onclick = () => {
    window.focus()
    options?.onClick?.()
    notification.close()
  }
  return () => notification.close()
}

async function wakeDesktopWindow() {
  try {
    await invoke('wake_window', { pinOnTop: true })
    return
  } catch {
    // Fall back to window APIs when custom wake command is unavailable.
  }
  try {
    const { getCurrentWindow, UserAttentionType } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    await win.show().catch(() => {})
    await win.unminimize().catch(() => {})
    await win.setFocus().catch(() => {})
    await win.requestUserAttention(UserAttentionType.Critical).catch(() => {})
  } catch {
    // Best-effort wake-up.
  }
}

export function useDesktopAlert({
  call,
  latestHistory,
  connected,
}: {
  call: Call | null
  latestHistory?: History
  connected: boolean
}) {
  const seenHistoryId = useRef<string | undefined>(latestHistory?.id)

  useEffect(() => {
    if (!connected || typeof Notification === 'undefined') return
    if (Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => {})
    }
  }, [connected])

  useEffect(() => {
    const native = isTauri()
    if (call?.phase !== 'incoming') {
      if (native) {
        void invoke('clear_window_attention').catch(() => {})
      }
      return
    }

    if (native) {
      void wakeDesktopWindow()
    }

    let cancelled = false
    let cleanup: (() => void) | undefined
    const shouldNotify = native || typeof document === 'undefined' || document.hidden || !document.hasFocus()
    if (shouldNotify) {
      const { title, body } = buildIncomingAlertText(call)
      void notifyDesktopEvent(title, body, {
        urgent: true,
        tag: `incoming-${call.id}`,
        onClick: () => {
          if (native) void wakeDesktopWindow()
        },
      }).then(close => {
        if (cancelled) close?.()
        else cleanup = close
      }).catch(() => {})
    }

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [call?.id, call?.phase])

  useEffect(() => {
    if (!latestHistory) return
    if (seenHistoryId.current === latestHistory.id) return
    seenHistoryId.current = latestHistory.id

    if (latestHistory.direction !== 'incoming' || latestHistory.outcome !== 'missed') return
    const shouldNotify = isTauri() || typeof document === 'undefined' || document.hidden || !document.hasFocus()
    if (!shouldNotify) return

    const body = latestHistory.ownNumber
      ? `打给本机：${latestHistory.ownNumber}`
      : '刚刚有一通来电未接听'
    void notifyDesktopEvent(`未接来电 · ${latestHistory.peer}`, body, {
      tag: `missed-${latestHistory.id}`,
      onClick: () => {
        if (isTauri()) void wakeDesktopWindow()
      },
    })
  }, [latestHistory?.id])
}

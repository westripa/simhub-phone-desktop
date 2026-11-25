import { useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import type { PhoneState } from '../types'
import { notifyDesktopEvent } from './use-desktop-alert'

export function useCloseGuard(
  state: PhoneState,
  disconnect: () => Promise<void>,
  hangup: () => Promise<void>,
  notice: (message: string) => void,
  keepInTray = false,
) {
  const latest = useRef({ state, disconnect, hangup, notice, keepInTray })
  latest.current = { state, disconnect, hangup, notice, keepInTray }
  const approved = useRef(false)
  const exitAfterCall = useRef(false)
  const closing = useRef(false)
  const trayTipShown = useRef(false)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<'call' | 'unknown' | null>(null)
  const closeWindow = useRef<(() => Promise<void>) | null>(null)

  async function closeIdle() {
    if (closing.current || !closeWindow.current) return
    closing.current = true
    setBusy(true)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      // Once no call remains, unregister best-effort; never trap the user in
      // a window forever because an idle registration server stopped replying.
      await Promise.race([latest.current.disconnect(), new Promise<void>(resolve => { timer = setTimeout(resolve, 2500) })])
      approved.current = true
      await closeWindow.current()
    } catch {
      approved.current = false
      latest.current.notice('无法关闭窗口，请先确认没有活动通话后重试。')
    } finally { clearTimeout(timer); closing.current = false; setBusy(false) }
  }
  const closeIdleRef = useRef(closeIdle)
  closeIdleRef.current = closeIdle

  useEffect(() => {
    const native = isTauri()
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!native && latest.current.state.call) { event.preventDefault(); event.returnValue = '' }
    }
    const pageHide = () => { void latest.current.disconnect() }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('pagehide', pageHide)
    let disposed = false
    let unlisten: (() => void) | undefined
    let unlistenQuit: (() => void) | undefined
    if (native) void Promise.all([
      import('@tauri-apps/api/window'),
      import('@tauri-apps/api/event'),
    ]).then(async ([{ getCurrentWindow }, { listen }]) => {
      if (disposed) return
      const win = getCurrentWindow()
      // Destroy after the guard has approved the exit. Calling close() again from
      // inside the close-requested handler leaves the frameless window open.
      closeWindow.current = () => win.destroy()
      const stop = await win.onCloseRequested(async event => {
        if (approved.current) return
        event.preventDefault()
        const current = latest.current.state
        if (current.call) setDialog('call')
        else if (current.history[0]?.outcome === 'unknown' && current.connection === 'error') setDialog('unknown')
        else if (latest.current.keepInTray) {
          await win.hide().catch(() => {})
          if (!trayTipShown.current) {
            trayTipShown.current = true
            void notifyDesktopEvent(
              'SimHub Phone 已最小化到托盘',
              '号码保持在线，来电时将自动弹窗唤醒；如需彻底退出请右键系统托盘图标。',
            )
          }
        } else void closeIdleRef.current()
      })
      const stopQuit = await listen('simhub://quit-requested', async () => {
        const current = latest.current.state
        if (current.call) {
          await win.show().catch(() => {})
          await win.unminimize().catch(() => {})
          await win.setFocus().catch(() => {})
          setDialog('call')
        } else if (current.history[0]?.outcome === 'unknown' && current.connection === 'error') {
          await win.show().catch(() => {})
          await win.unminimize().catch(() => {})
          await win.setFocus().catch(() => {})
          setDialog('unknown')
        } else {
          void closeIdleRef.current()
        }
      })
      if (disposed) {
        stop()
        stopQuit()
      } else {
        unlisten = stop
        unlistenQuit = stopQuit
      }
    }).catch(() => latest.current.notice('窗口关闭保护未能启用，请先结束通话再退出。'))
    return () => {
      disposed = true
      unlisten?.()
      unlistenQuit?.()
      window.removeEventListener('beforeunload', beforeUnload)
      window.removeEventListener('pagehide', pageHide)
    }
  }, [])

  useEffect(() => {
    if (!exitAfterCall.current || state.call) return
    exitAfterCall.current = false
    if (state.history[0]?.outcome === 'unknown') setDialog('unknown')
    else { setDialog(null); void closeIdleRef.current() }
  }, [state.call, state.history])

  function dismiss() { exitAfterCall.current = false; setDialog(null) }
  function endAndExit() { exitAfterCall.current = true; void latest.current.hangup() }
  return { busy, dialog, dismiss, endAndExit, forceExit: () => { setDialog(null); void closeIdleRef.current() } }
}

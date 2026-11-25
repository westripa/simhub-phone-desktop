import { useEffect, useState, type MouseEvent } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { Copy, Minus, Moon, Square, Sun, X } from 'lucide-react'
import icon from '@/assets/icon.svg'
import { ConnectionDot } from '@/components/phone/connection-dot'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCallClock } from '@/phone/hooks/use-call-clock'
import { connectionLabel, phaseLabel } from '@/phone/labels'
import type { AccountSlot } from '@/phone/sip/pool'
import { accountDisplayNumber, type Account, type Call, type Connection } from '@/phone/types'

export function Titlebar({ account, accounts, connection, call, busy, theme, onToggleTheme, onToggleConnection, onManageNumbers }: {
  account: Account
  accounts?: AccountSlot[]
  connection: Connection
  call: Call | null
  busy: boolean
  theme: 'dark' | 'light'
  onToggleTheme: (event?: MouseEvent<HTMLButtonElement>) => void
  onToggleConnection: () => void
  onManageNumbers?: () => void
}) {
  const [native] = useState(() => isTauri())
  const [maximized, setMaximized] = useState(false)
  const clock = useCallClock(call?.answered)
  const accountName = account.mode === 'demo' ? '本地演示' : (accountDisplayNumber(account) || '未配置分机')
  const onlineCount = accounts?.filter(slot => slot.status === 'registered').length ?? 0
  const multiSuffix = account.mode === 'sip' && (accounts?.length ?? 0) > 1 ? ` (${onlineCount}/${accounts!.length})` : ''
  const action = connection === 'registered' ? '断开账号' : '连接账号'
  const statusText = connectionLabel[connection]

  useEffect(() => {
    if (!native) return
    let disposed = false
    let stop: (() => void) | undefined
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      if (disposed) return
      const win = getCurrentWindow()
      const sync = () => {
        void win.isMaximized()
          .then(value => { if (!disposed) setMaximized(value) })
          .catch(() => {})
      }
      sync()
      const unlisten = await win.onResized(sync)
      if (disposed) unlisten()
      else stop = unlisten
    }).catch(() => {})
    return () => {
      disposed = true
      stop?.()
    }
  }, [native])

  async function windowAction(kind: 'minimize' | 'maximize' | 'close') {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      if (kind === 'minimize') await win.minimize()
      else if (kind === 'maximize') await win.toggleMaximize()
      else await win.close()
    } catch {
      // Window controls are an enhancement; a failed call must not break the app.
    }
  }

  return (
    <header className="vt-titlebar flex h-10 shrink-0 select-none items-center border-b border-border bg-titlebar">
      <div data-tauri-drag-region className="flex h-full shrink-0 items-center gap-2 pl-3.5 pr-3">
        <img src={icon} alt="" className="pointer-events-none size-4.5 rounded-[5px]" />
        <div data-tauri-drag-region className="pointer-events-none flex items-baseline gap-1">
          <span className="text-[13px] font-semibold tracking-tight text-foreground">SimHub</span>
          <span className="text-[13px] text-muted-foreground">Phone</span>
        </div>
      </div>

      <div
        data-tauri-drag-region
        onDoubleClick={() => { if (native) void windowAction('maximize') }}
        className="flex h-full min-w-0 flex-1 items-center justify-center px-3"
      >
        {call && (
          <div className="pointer-events-none flex min-w-0 items-center gap-2 rounded-full border border-border bg-panel px-3 py-0.5 text-xs text-muted-foreground">
            <span className={cn('size-2 shrink-0 rounded-full', call.phase === 'connected' ? 'bg-success' : 'bg-warning status-pulse')} />
            {call.ownNumber && (
              <>
                <span className="hidden max-w-32 truncate font-medium text-primary sm:inline">{call.ownNumber}</span>
                <span className="hidden text-muted-foreground sm:inline">⇄</span>
              </>
            )}
            <span className="max-w-44 truncate font-mono text-foreground">{call.peer}</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">{phaseLabel[call.phase]}</span>
            {clock && <span className="font-mono tabular-nums text-foreground">{clock}</span>}
          </div>
        )}
      </div>

      <div className={cn('flex h-full shrink-0 items-center gap-1.5', !native && 'pr-3')}>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          aria-label={account.mode === 'demo' && onManageNumbers ? '本地演示 · 绑定号码' : (busy ? `${accountName}，${statusText}` : `${accountName}，${statusText}，点击${action}`)}
          title={account.mode === 'demo' && onManageNumbers ? '前往绑定与管理号码' : (busy ? undefined : action)}
          className="h-7 gap-1.5 rounded-full border border-border bg-panel px-3 text-xs font-normal text-foreground shadow-none hover:bg-accent sm:h-7 sm:text-xs"
          onClick={account.mode === 'demo' && onManageNumbers ? onManageNumbers : onToggleConnection}
        >
          <ConnectionDot connection={connection} />
          {account.mode === 'demo' && onManageNumbers ? (
            <span className="truncate">本地演示 · 绑定号码</span>
          ) : (
            <>
              <span className="max-w-36 truncate max-[380px]:hidden">{accountName}{multiSuffix}</span>
              <span className="hidden text-muted-foreground sm:inline">· {statusText}</span>
            </>
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          className="size-7.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground sm:size-7.5"
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </Button>

        {native && (
          <div className="ml-1 flex h-full items-stretch border-l border-border/60">
            <Button variant="ghost" size="icon" aria-label="最小化" title="最小化" className="h-full w-11 rounded-none text-muted-foreground hover:bg-accent hover:text-foreground sm:h-full sm:w-11" onClick={() => void windowAction('minimize')}>
              <Minus size={14} />
            </Button>
            <Button variant="ghost" size="icon" aria-label={maximized ? '还原' : '最大化'} title={maximized ? '还原' : '最大化'} className="h-full w-11 rounded-none text-muted-foreground hover:bg-accent hover:text-foreground sm:h-full sm:w-11" onClick={() => void windowAction('maximize')}>
              {maximized ? <Copy size={12} /> : <Square size={12} />}
            </Button>
            <Button variant="ghost" size="icon" aria-label="关闭" title="关闭" className="h-full w-11 rounded-none text-muted-foreground hover:bg-destructive hover:text-destructive-foreground sm:h-full sm:w-11" onClick={() => void windowAction('close')}>
              <X size={15} />
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}

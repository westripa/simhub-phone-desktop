import { Kbd } from '@/components/ui/kbd'
import { Separator } from '@/components/ui/separator'
import type { View } from '@/components/workbench/view'
import { cn } from '@/lib/utils'
import { connectionLabel } from '@/phone/labels'
import type { AccountSlot } from '@/phone/sip/pool'
import type { Account, Call, Connection } from '@/phone/types'

const dotClass: Record<Connection, string> = {
  offline: 'bg-statusbar-foreground/50',
  connecting: 'bg-statusbar-warning status-pulse',
  registered: 'bg-statusbar-online',
  error: 'bg-statusbar-error',
}

export function StatusBar({
  account,
  accounts,
  connection,
  call,
  held,
  view,
  appVersion,
  availableVersion,
  onOpenUpdate,
}: {
  account: Account
  accounts?: AccountSlot[]
  connection: Connection
  call: Call | null
  held?: boolean
  view: View
  appVersion?: string
  availableVersion?: string | null
  onOpenUpdate?: () => void
}) {
  const onlineCount = accounts?.filter(s => s.status === 'registered').length ?? 0
  const poolSummary = account.mode === 'sip' && (accounts?.length ?? 0) > 1
    ? ` · ${onlineCount}/${accounts!.length} 号在线`
    : ''
  const modeSummary = account.mode === 'demo'
    ? '本地演示 · 不拨打真实电话'
    : (account.ha1 && !account.password
      ? '标准 SIP (WSS · HA1) · 凭据仅驻留内存'
      : '标准 SIP (WSS) · 凭据仅驻留内存') + poolSummary

  return (
    <footer className="vt-statusbar flex h-7 shrink-0 items-center gap-2.5 bg-statusbar px-3.5 text-xs text-statusbar-foreground">
      <span className="flex shrink-0 items-center gap-1.5" role="status">
        <span aria-hidden="true" className={cn('size-1.5 rounded-full', dotClass[connection])} />
        {connectionLabel[connection]}
      </span>
      <Separator orientation="vertical" className="h-3.5 bg-statusbar-foreground/20" />
      <span className="truncate">{modeSummary}</span>
      {onOpenUpdate && (
        <>
          <Separator orientation="vertical" className="h-3.5 bg-statusbar-foreground/20" />
          <button
            type="button"
            onClick={onOpenUpdate}
            className="shrink-0 cursor-pointer rounded px-1.5 py-0.5 font-mono text-[11px] hover:bg-statusbar-foreground/15"
            title="查看版本与更新"
          >
            {availableVersion ? `可更新 v${availableVersion}` : `v${appVersion || '0.2.0'}`}
          </button>
        </>
      )}

      <span className="ml-auto hidden shrink-0 items-center gap-1.5 text-statusbar-foreground/85 md:flex">
        {!call && view === 'dial' && (
          <>
            <Kbd className="h-4.5 min-w-4.5 border border-statusbar-foreground/25 bg-transparent px-1 text-[11px] text-statusbar-foreground">Enter</Kbd>
            呼叫
            <Separator orientation="vertical" className="mx-1 h-3.5 bg-statusbar-foreground/20" />
            <Kbd className="h-4.5 min-w-4.5 border border-statusbar-foreground/25 bg-transparent px-1 text-[11px] text-statusbar-foreground">Backspace</Kbd>
            删除
          </>
        )}
        {call?.phase === 'incoming' && (
          <>
            <Kbd className="h-4.5 min-w-4.5 border border-statusbar-foreground/25 bg-transparent px-1 text-[11px] text-statusbar-foreground">Enter</Kbd>
            接听
            <Separator orientation="vertical" className="mx-1 h-3.5 bg-statusbar-foreground/20" />
            <Kbd className="h-4.5 min-w-4.5 border border-statusbar-foreground/25 bg-transparent px-1 text-[11px] text-statusbar-foreground">Esc</Kbd>
            拒接
          </>
        )}
        {call && call.phase !== 'incoming' && call.phase !== 'ending' && (
          <>
            {call.phase === 'connected' && (
              <>
                <Kbd className="h-4.5 min-w-4.5 border border-statusbar-foreground/25 bg-transparent px-1 text-[11px] text-statusbar-foreground">M</Kbd>
                静音
                <Separator orientation="vertical" className="mx-1 h-3.5 bg-statusbar-foreground/20" />
                <Kbd className="h-4.5 min-w-4.5 border border-statusbar-foreground/25 bg-transparent px-1 text-[11px] text-statusbar-foreground">H</Kbd>
                {held ? '恢复' : '保持'}
                <Separator orientation="vertical" className="mx-1 h-3.5 bg-statusbar-foreground/20" />
              </>
            )}
            <Kbd className="h-4.5 min-w-4.5 border border-statusbar-foreground/25 bg-transparent px-1 text-[11px] text-statusbar-foreground">Esc</Kbd>
            {call.phase === 'connected' ? '挂断' : '取消'}
          </>
        )}
      </span>
    </footer>
  )
}

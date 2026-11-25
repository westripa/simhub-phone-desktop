import { CircleAlert, Layers, PhoneIncoming, X } from 'lucide-react'
import { NumberQuickCard } from '@/components/numbers/number-quick-card'
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardPanel } from '@/components/ui/card'
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import type { AccountSlot } from '@/phone/sip/pool'
import { accountDisplayNumber, normalizeAccountGroup, type Account, type Connection } from '@/phone/types'
import { ConnectionBanner } from './connection-banner'
import { ConnectionDot } from './connection-dot'
import { DialPad } from './dial-pad'

export function DialerView({
  account,
  accounts,
  defaultAccountKey,
  connection,
  number,
  lastNumber,
  ready,
  busy,
  onNumberChange,
  onDial,
  onKeySound,
  onConnect,
  onSettings,
  onSelectDefault,
  onConnectKey,
  onOpenNumbers,
  onIncoming,
  onOpenAudio,
  noticeMessage,
  onDismissNotice,
}: {
  account: Account
  accounts?: AccountSlot[]
  defaultAccountKey?: string
  connection: Connection
  number: string
  lastNumber?: string
  ready: boolean
  busy: boolean
  onNumberChange: (value: string) => void
  onDial: () => void
  onKeySound: (digit?: string) => void
  onConnect: () => void
  onSettings: () => void
  onSelectDefault?: (key: string) => void
  onConnectKey?: (key: string) => void
  onOpenNumbers?: () => void
  onIncoming?: () => void
  onOpenAudio?: () => void
  noticeMessage?: string
  onDismissNotice?: () => void
}) {
  const displayNum = account.mode === 'sip' ? accountDisplayNumber(account) : ''
  const statusSummary = ready
    ? account.mode === 'demo'
      ? '本地演示分机'
      : account.label
        ? `出局主叫 · ${account.label} (${displayNum})`
        : displayNum
          ? `出局主叫 · ${displayNum}`
          : 'SIP 线路就绪'
    : connection === 'connecting'
      ? '正在连接...'
      : '未连接'

  const slotList = accounts ?? []
  const hasSipAccounts = account.mode === 'sip' && slotList.length > 0 && Boolean(onSelectDefault)
  const activeSlot = hasSipAccounts
    ? (slotList.find(s => s.key === defaultAccountKey) ?? slotList[0])
    : undefined
  const activeGroup = activeSlot ? normalizeAccountGroup(activeSlot.account.group) : ''
  const onlineCount = slotList.filter(s => s.status === 'registered').length
  const selectItems = slotList.map(s => {
    const shown = accountDisplayNumber(s.account)
    return {
      value: s.key,
      label: s.account.label
        ? `${s.account.label} (${shown})`
        : s.account.phoneNumber
          ? `${shown} (${s.account.username})`
          : `${s.account.username}@${s.account.domain}`,
    }
  })

  return (
    <div className="vt-call flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="mx-auto my-auto flex w-full max-w-[372px] flex-col px-4 py-4 @min-[720px]/main:max-w-[800px] @min-[720px]/main:px-6 @min-[720px]/main:py-6">
        {!ready && (
          <ConnectionBanner
            account={account}
            connection={connection}
            busy={busy}
            onConnect={onConnect}
            onSettings={onSettings}
            onOpenNumbers={onOpenNumbers}
          />
        )}

        {noticeMessage && (
          <Alert variant="warning" className="mb-4 border-warning/40 bg-warning/10 shadow-sm">
            <CircleAlert />
            <AlertDescription className="text-xs font-medium text-foreground sm:text-[13px]">
              {noticeMessage}
            </AlertDescription>
            {onDismissNotice && (
              <AlertAction>
                <Button variant="ghost" size="icon-xs" aria-label="关闭通话提醒" onClick={onDismissNotice}>
                  <X size={14} />
                </Button>
              </AlertAction>
            )}
          </Alert>
        )}

        <div className="grid grid-cols-1 items-center gap-5 @min-[720px]/main:grid-cols-[356px_minmax(0,1fr)]">
          <Card className="w-full py-0 shadow-sm">
            <CardPanel className="grid gap-3 p-4 sm:p-5">
              {hasSipAccounts && activeSlot && (
                <>
                  <div className="grid gap-2" aria-label="出局主叫选择">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">出局主叫</span>
                        {activeGroup && <Badge variant="outline" size="sm">{activeGroup}</Badge>}
                      </div>
                      {onOpenNumbers && (
                        <Button variant="ghost" size="xs" className="h-6 px-2 text-xs" onClick={onOpenNumbers}>
                          管理 ({onlineCount}/{slotList.length})
                        </Button>
                      )}
                    </div>
                    {slotList.length > 1 ? (
                      <Select
                        items={selectItems}
                        value={activeSlot.key}
                        disabled={busy}
                        onValueChange={value => {
                          if (value) onSelectDefault?.(value)
                        }}
                      >
                        <SelectTrigger size="sm" aria-label="切换出局主叫号码" className="h-8.5 text-xs">
                          <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                            <ConnectionDot connection={activeSlot.status} />
                            <SelectValue className="font-mono text-xs" />
                          </span>
                        </SelectTrigger>
                        <SelectPopup>
                          {slotList.map(slot => (
                            <SelectItem key={slot.key} value={slot.key}>
                              <span className="flex min-w-0 items-center gap-2">
                                <ConnectionDot connection={slot.status} />
                                <span className="truncate font-mono text-xs">{accountDisplayNumber(slot.account)}</span>
                                {slot.account.label && <Badge variant="secondary" size="sm">{slot.account.label}</Badge>}
                                <span className="truncate text-xs text-muted-foreground">{normalizeAccountGroup(slot.account.group)}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectPopup>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs">
                        <ConnectionDot connection={activeSlot.status} />
                        <span className="truncate font-mono font-medium">{accountDisplayNumber(activeSlot.account)}</span>
                        {activeSlot.account.label && <Badge variant="secondary" size="sm">{activeSlot.account.label}</Badge>}
                      </div>
                    )}
                  </div>
                  <Separator />
                </>
              )}

              <DialPad
                number={number}
                lastNumber={lastNumber}
                ready={ready}
                connecting={connection === 'connecting'}
                statusSummary={statusSummary}
                onNumberChange={onNumberChange}
                onDial={onDial}
                onKeySound={onKeySound}
              />

              {account.mode === 'demo' && (
                <div className="grid gap-2.5 @min-[720px]/main:hidden">
                  <Separator />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="h-8 text-xs"
                      disabled={!ready || busy}
                      onClick={onIncoming ?? onConnect}
                    >
                      <PhoneIncoming size={13} />模拟来电
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      className="h-8 text-xs"
                      disabled={busy}
                      onClick={onOpenNumbers ?? onSettings}
                    >
                      <Layers size={13} />绑定 SIP 号码
                    </Button>
                  </div>
                </div>
              )}
            </CardPanel>
          </Card>

          <div className="hidden @min-[720px]/main:block">
            <NumberQuickCard
              account={account}
              accounts={slotList}
              defaultAccountKey={defaultAccountKey}
              ready={ready}
              busy={busy}
              onSelectDefault={onSelectDefault}
              onConnectKey={onConnectKey}
              onOpenNumbers={onOpenNumbers ?? onSettings}
              onIncoming={onIncoming ?? onConnect}
              onOpenAudio={onOpenAudio ?? onSettings}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

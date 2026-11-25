import { ArrowRight, Headphones, Layers, PhoneIncoming, Users } from 'lucide-react'
import { ConnectionDot } from '@/components/phone/connection-dot'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { connectionLabel } from '@/phone/labels'
import type { AccountSlot } from '@/phone/sip/pool'
import { accountDisplayNumber, hasAccountCredential, normalizeAccountGroup, type Account } from '@/phone/types'

export function NumberQuickCard({
  account,
  accounts,
  defaultAccountKey,
  ready,
  busy,
  onSelectDefault,
  onConnectKey,
  onOpenNumbers,
  onIncoming,
  onOpenAudio,
}: {
  account: Account
  accounts: AccountSlot[]
  defaultAccountKey?: string
  ready: boolean
  busy: boolean
  onSelectDefault?: (key: string) => void
  onConnectKey?: (key: string) => void
  onOpenNumbers: () => void
  onIncoming: () => void
  onOpenAudio: () => void
}) {
  if (account.mode === 'sip') {
    const onlineCount = accounts.filter(slot => slot.status === 'registered').length
    const grouped = new Map<string, AccountSlot[]>()
    for (const slot of accounts) {
      const groupName = normalizeAccountGroup(slot.account.group)
      const list = grouped.get(groupName)
      if (list) list.push(slot)
      else grouped.set(groupName, [slot])
    }

    return (
      <Card className="w-full py-0 shadow-sm">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-sm font-semibold">本机号码组</CardTitle>
          <CardDescription className="text-xs">点击号码即可切换默认出局主叫</CardDescription>
          <CardAction>
            <Badge variant={onlineCount > 0 ? 'success' : 'outline'} size="sm">
              {onlineCount}/{accounts.length} 在线
            </Badge>
          </CardAction>
        </CardHeader>

        <CardPanel className="px-5 pb-4 pt-1">
          {accounts.length === 0 ? (
            <Empty className="py-6 md:py-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Users size={18} strokeWidth={1.6} />
                </EmptyMedia>
                <EmptyTitle className="text-xs">尚未绑定 SIP 号码</EmptyTitle>
                <EmptyDescription className="text-xs">导入配网链接或配置文本后即可在这里快速切换主叫。</EmptyDescription>
                <Button type="button" size="sm" className="mt-3" disabled={busy} onClick={onOpenNumbers}>
                  前往导入配网
                </Button>
              </EmptyHeader>
            </Empty>
          ) : (
            <ScrollArea className="max-h-[272px] pr-1">
              <div className="grid gap-3.5">
                {[...grouped.entries()].map(([groupName, slots]) => (
                  <div key={groupName} className="grid gap-1.5">
                    <div className="flex items-center justify-between px-0.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/85">{groupName}</span>
                      <span className="tabular-nums">{slots.length} 个</span>
                    </div>
                    <div className="grid gap-1.5">
                      {slots.map(slot => {
                        const selected = slot.key === defaultAccountKey
                        const offlineCanReconnect = slot.status !== 'registered'
                          && slot.status !== 'connecting'
                          && hasAccountCredential(slot.account)
                          && Boolean(onConnectKey)
                        return (
                          <div key={slot.key} className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              disabled={busy}
                              onClick={() => onSelectDefault?.(slot.key)}
                              className={cn(
                                'h-auto min-w-0 flex-1 justify-between rounded-xl px-3 py-2 text-left font-normal shadow-none sm:h-auto',
                                selected && 'border-primary/60 bg-primary/8 hover:bg-primary/12',
                              )}
                            >
                              <div className="flex min-w-0 items-center gap-2.5">
                                <ConnectionDot connection={slot.status} />
                                <div className="min-w-0">
                                  <div className="truncate font-mono text-xs font-semibold text-foreground">
                                    {accountDisplayNumber(slot.account)}
                                  </div>
                                  <div className={cn('truncate text-xs', slot.status === 'error' && slot.message ? 'text-destructive' : 'text-muted-foreground')}>
                                    {slot.account.label ? `${slot.account.label} · ` : ''}
                                    {slot.status === 'error' && slot.message ? slot.message : connectionLabel[slot.status]}
                                  </div>
                                </div>
                              </div>
                              {selected ? (
                                <Badge variant="info" size="sm" className="shrink-0">当前主叫</Badge>
                              ) : (
                                <span className="shrink-0 text-xs text-muted-foreground">设为主叫</span>
                              )}
                            </Button>
                            {offlineCanReconnect && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                disabled={busy}
                                onClick={() => onConnectKey?.(slot.key)}
                              >
                                重连
                              </Button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardPanel>

        <CardFooter className="border-t border-border px-5 py-3">
          <Button type="button" variant="outline" size="sm" className="w-full justify-between" onClick={onOpenNumbers}>
            <span>号码绑定与分组管理</span>
            <ArrowRight size={14} />
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full py-0 shadow-sm">
      <CardHeader className="p-5 pb-3">
        <CardTitle className="text-sm font-semibold">绑定标准 SIP 号码</CardTitle>
        <CardDescription className="text-xs leading-relaxed">
          导入配网链接或配置文本，按号码组管理多个真实出局主叫并接听来电。
        </CardDescription>
        <CardAction>
          <Badge variant="warning" size="sm">演示模式</Badge>
        </CardAction>
      </CardHeader>

      <CardPanel className="grid gap-3.5 px-5 pb-5 pt-1">
        <Button type="button" size="sm" className="w-full" disabled={busy} onClick={onOpenNumbers}>
          <Layers size={15} />导入配网并绑定号码
        </Button>

        <Separator />

        <div className="grid gap-2">
          <div className="text-xs font-medium text-muted-foreground">演示与设备自检</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start"
            disabled={!ready || busy}
            onClick={onIncoming}
          >
            <PhoneIncoming size={14} />触发本地模拟来电
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={onOpenAudio}
          >
            <Headphones size={14} />声音、麦克风与铃声设置
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <Badge variant="secondary" size="sm">多号码池叠加</Badge>
          <Badge variant="secondary" size="sm">Digest HA1</Badge>
          <Badge variant="secondary" size="sm">通话保持 / DTMF</Badge>
          <Badge variant="secondary" size="sm">AI 转人工识别</Badge>
        </div>
      </CardPanel>
    </Card>
  )
}

import type { ReactNode } from 'react'
import { Headphones, History, Layers, Phone, UserRoundCog } from 'lucide-react'
import { ConnectionDot } from '@/components/phone/connection-dot'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { connectionLabel } from '@/phone/labels'
import type { Connection } from '@/phone/types'
import type { View } from './view'

const views = [
  { value: 'dial', label: '拨号台', icon: Phone },
  { value: 'numbers', label: '号码管理', icon: Layers },
  { value: 'history', label: '通话记录', icon: History },
] as const

function RailItem({ label, active, disabled, onClick, children }: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            disabled={disabled}
            className={cn(
              'relative size-10 rounded-lg text-rail-foreground [&_svg]:opacity-100 hover:bg-rail-hover hover:text-rail-strong sm:size-10',
              active && 'bg-rail-active text-rail-strong hover:bg-rail-active hover:text-rail-strong',
            )}
            onClick={onClick}
          />
        )}
      >
        {children}
        {active && <span aria-hidden="true" className="absolute -left-2 top-2.5 h-5 w-[3px] rounded-full bg-rail-indicator" />}
      </TooltipTrigger>
      <TooltipPopup side="right" sideOffset={8}>{label}</TooltipPopup>
    </Tooltip>
  )
}

export function ActivityBar({
  view,
  connection,
  accountBusy,
  missedCount,
  numberCount,
  onlineCount,
  isDemo,
  onViewChange,
  onAudioSettings,
  onAccountSettings,
}: {
  view: View
  connection: Connection
  accountBusy: boolean
  missedCount: number
  numberCount?: number
  onlineCount?: number
  isDemo?: boolean
  onViewChange: (view: View) => void
  onAudioSettings: () => void
  onAccountSettings: () => void
}) {
  return (
    <TooltipProvider>
      <div className="vt-rail flex w-14 shrink-0 flex-col items-center border-r border-border bg-rail py-2.5">
        <nav aria-label="主导航" className="flex flex-col items-center gap-1.5">
          {views.map(item => {
            const label = item.value === 'history' && missedCount > 0
              ? `${item.label}（${missedCount} 条未接/异常）`
              : item.value === 'numbers'
                ? (isDemo
                    ? `${item.label}（当前为演示模式，点击绑定 SIP 号码）`
                    : `${item.label}（${onlineCount ?? 0}/${numberCount ?? 0} 在线）`)
                : item.label
            return (
              <RailItem
                key={item.value}
                label={label}
                active={view === item.value}
                onClick={() => onViewChange(item.value)}
              >
                <item.icon size={19} strokeWidth={1.8} />
                {item.value === 'history' && missedCount > 0 && view !== 'history' && (
                  <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive ring-2 ring-rail" />
                )}
                {item.value === 'numbers' && (isDemo || (numberCount ?? 0) === 0) && view !== 'numbers' && (
                  <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-2 rounded-full bg-warning ring-2 ring-rail" />
                )}
              </RailItem>
            )
          })}
        </nav>

        <div className="mt-auto flex flex-col items-center gap-1.5">
          <Separator className="my-1 w-6" />
          <RailItem label="声音与设备" onClick={onAudioSettings}>
            <Headphones size={19} strokeWidth={1.8} />
          </RailItem>
          <RailItem label={`账号设置 · ${connectionLabel[connection]}`} disabled={accountBusy} onClick={onAccountSettings}>
            <UserRoundCog size={19} strokeWidth={1.8} />
            <ConnectionDot connection={connection} className="absolute bottom-1.5 right-1.5 border-2 border-rail" />
          </RailItem>
        </div>
      </div>
    </TooltipProvider>
  )
}

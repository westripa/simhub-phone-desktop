import { useState } from 'react'
import { ArrowDownLeft, ArrowRight, ArrowUpRight, History as HistoryIcon, Phone, PhoneIncoming, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { formatHistoryTime } from '@/phone/format'
import { outcomeLabel } from '@/phone/labels'
import type { History } from '@/phone/types'
import { runViewTransition } from '@/phone/view-transition'

function RecentRow({ item, disabled, ready, onSelect, onDial }: {
  item: History
  disabled: boolean
  ready: boolean
  onSelect: () => void
  onDial: () => void
}) {
  const bad = ['missed', 'failed'].includes(item.outcome)
  const warn = ['rejected', 'unknown'].includes(item.outcome)
  return (
    <div className="group relative flex items-center rounded-lg hover:bg-accent">
      <Button
        variant="ghost"
        disabled={disabled}
        aria-label={`填入号码 ${item.peer}`}
        className="h-auto min-w-0 flex-1 items-start gap-2.5 rounded-lg px-2.5 py-2.5 pr-9 text-left font-normal hover:bg-transparent sm:h-auto"
        onClick={onSelect}
      >
        <span className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border',
          bad ? 'border-destructive/20 bg-destructive/10 text-destructive'
            : warn ? 'border-warning/20 bg-warning/10 text-warning'
              : 'border-border bg-accent text-primary',
        )}>
          {item.direction === 'incoming' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[13px] font-medium">{item.peer}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {item.ownNumber ? `${item.ownNumber} · ` : ''}
            {item.transferSource ? `AI转人工${item.transferReason ? `(${item.transferReason})` : ''} · ` : ''}
            {outcomeLabel[item.outcome]} · {formatHistoryTime(item.started)}
          </span>
          {item.reasonText && (
            <span className={cn('mt-0.5 block truncate text-[11px]', bad ? 'text-destructive' : 'text-warning')}>
              {item.reasonText}
            </span>
          )}
        </span>
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={disabled || !ready}
        aria-label={`直接呼叫 ${item.peer}`}
        title={`直接呼叫 ${item.peer}`}
        className="absolute right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 text-primary hover:bg-primary/15 sm:size-6"
        onClick={onDial}
      >
        <Phone size={12} />
      </Button>
    </div>
  )
}

export function RecentCalls({ history, inCall, demo, ready, onSelect, onDialNumber, onClear, onIncoming, onViewHistory }: {
  history: History[]
  inCall: boolean
  demo: boolean
  ready: boolean
  onSelect: (peer: string) => void
  onDialNumber: (peer: string) => void
  onClear: () => void
  onIncoming: () => void
  onViewHistory: () => void
}) {
  const [filter, setFilter] = useState<'all' | 'missed'>('all')
  const missedCount = history.filter(item => ['missed', 'failed', 'unknown'].includes(item.outcome)).length
  const filtered = filter === 'missed'
    ? history.filter(item => ['missed', 'failed', 'unknown'].includes(item.outcome))
    : history

  return (
    <aside className="hidden w-[224px] shrink-0 flex-col border-r border-border bg-sidebar md:flex xl:w-[268px]" aria-label="最近通话">
      <div className="flex h-11 shrink-0 items-center justify-between gap-1.5 border-b border-border px-3">
        <Tabs
          value={filter}
          onValueChange={val => runViewTransition(() => setFilter(val as 'all' | 'missed'), 'filter')}
        >
          <TabsList size="sm" className="h-7.5">
            <TabsTab value="all" className="px-2.5 text-xs sm:text-xs">全部 {history.length}</TabsTab>
            <TabsTab value="missed" className="px-2.5 text-xs sm:text-xs">
              未接 {missedCount > 0 ? missedCount : ''}
            </TabsTab>
          </TabsList>
        </Tabs>
        <Button variant="ghost" size="icon-xs" disabled={!history.length} aria-label="清空本次通话记录" onClick={onClear}>
          <Trash2 size={14} />
        </Button>
      </div>

      {filtered.length ? (
        <ScrollArea className="min-h-0 flex-1">
          <ul className="p-2">
            {filtered.map(item => (
              <li key={item.id}>
                <RecentRow
                  item={item}
                  disabled={inCall}
                  ready={ready}
                  onSelect={() => onSelect(item.peer)}
                  onDial={() => onDialNumber(item.peer)}
                />
              </li>
            ))}
          </ul>
        </ScrollArea>
      ) : (
        <Empty className="min-h-0 flex-1 p-5 md:p-5">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HistoryIcon size={18} strokeWidth={1.6} />
            </EmptyMedia>
            <EmptyDescription className="text-xs">
              {filter === 'missed' ? '没有未接或异常通话' : <>暂无记录<br />通话后自动显示</>}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <div className="shrink-0 border-t border-border p-2.5">
        {demo && (
          <Button variant="outline" size="xs" className="h-8 w-full justify-start px-2.5 text-xs sm:h-8 sm:text-xs" disabled={!ready || inCall} onClick={onIncoming}>
            <PhoneIncoming size={14} />模拟来电
          </Button>
        )}
        <Button variant="ghost" size="xs" className={cn('h-8 w-full justify-between px-2.5 text-xs text-muted-foreground sm:h-8 sm:text-xs', demo && 'mt-1.5')} onClick={onViewHistory}>
          全部记录 <ArrowRight size={14} />
        </Button>
      </div>
    </aside>
  )
}

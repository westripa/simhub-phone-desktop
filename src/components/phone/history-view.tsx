import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Check, Copy, History as HistoryIcon, Phone, PhoneIncoming, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardPanel } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
import { ViewHeader } from '@/components/workbench/view-header'
import { cn } from '@/lib/utils'
import { formatHistoryTime } from '@/phone/format'
import { directionLabel, outcomeLabel } from '@/phone/labels'
import { formatDuration, type History, type Outcome } from '@/phone/types'
import { runViewTransition } from '@/phone/view-transition'

const outcomeBadgeVariant: Record<Outcome, 'info' | 'secondary' | 'warning' | 'error'> = {
  completed: 'info',
  cancelled: 'secondary',
  rejected: 'warning',
  missed: 'error',
  failed: 'error',
  unknown: 'warning',
}

function HistoryRow({ item, disabled, ready, onSelect, onDial }: {
  item: History
  disabled: boolean
  ready: boolean
  onSelect: () => void
  onDial: () => void
}) {
  const [copied, setCopied] = useState(false)
  const bad = ['missed', 'failed'].includes(item.outcome)
  const warn = ['rejected', 'unknown'].includes(item.outcome)

  function copyNumber() {
    void navigator.clipboard?.writeText(item.peer).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  return (
    <div className="group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-accent/50">
      <Button
        variant="ghost"
        disabled={disabled}
        aria-label={`填入号码 ${item.peer}`}
        className="grid h-auto min-w-0 flex-1 grid-cols-[2rem_minmax(0,1fr)] items-center gap-3 rounded-md p-1 text-left font-normal hover:bg-transparent sm:h-auto md:grid-cols-[2rem_minmax(0,1fr)_6.5rem_5rem_4rem]"
        onClick={onSelect}
      >
        <span className={cn(
          'flex size-7 items-center justify-center rounded-full border',
          bad ? 'border-destructive/20 bg-destructive/10 text-destructive'
            : warn ? 'border-warning/20 bg-warning/10 text-warning'
              : 'border-border bg-accent text-primary',
        )}>
          {item.direction === 'incoming' ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
        </span>

        <span className="flex min-w-0 flex-col">
          <span className="truncate font-mono text-sm">{item.peer}</span>
          {(item.ownNumber || item.transferSource) && (
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              {item.ownNumber && <span className="truncate">本机号码: {item.ownNumber}</span>}
              {item.transferSource && (
                <Badge variant="warning" size="sm">
                  AI 转人工{item.transferReason ? ` · ${item.transferReason}` : ''}
                </Badge>
              )}
            </span>
          )}
          {item.reasonText && (
            <span className={cn('mt-0.5 truncate text-[11px]', bad ? 'text-destructive' : 'text-warning')}>
              {item.reasonText}
            </span>
          )}
          <span className="mt-0.5 truncate text-[10px] text-muted-foreground md:hidden">
            {directionLabel[item.direction]} · {outcomeLabel[item.outcome]} · {formatHistoryTime(item.started)}
          </span>
        </span>

        <Badge variant={outcomeBadgeVariant[item.outcome]} size="sm" className="hidden w-fit md:inline-flex">
          {outcomeLabel[item.outcome]}
        </Badge>
        <time className="hidden text-[11px] tabular-nums text-muted-foreground md:block" dateTime={new Date(item.started).toISOString()}>
          {formatHistoryTime(item.started)}
        </time>
        <span className="hidden font-mono text-[11px] tabular-nums text-muted-foreground md:block">
          {item.answered ? formatDuration((item.ended - item.answered) / 1000) : '—'}
        </span>
      </Button>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={copied ? '已复制号码' : `复制号码 ${item.peer}`}
          title={copied ? '已复制' : '复制号码'}
          className="text-muted-foreground hover:text-foreground sm:size-6"
          onClick={copyNumber}
        >
          {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
        </Button>
        <Button
          variant="outline"
          size="icon-xs"
          disabled={disabled || !ready}
          aria-label={`直接呼叫 ${item.peer}`}
          title={`直接呼叫 ${item.peer}`}
          className="text-primary hover:border-primary/40 hover:bg-primary/10 sm:size-6"
          onClick={onDial}
        >
          <Phone size={12} />
        </Button>
      </div>
    </div>
  )
}

export function HistoryView({
  history,
  inCall,
  demo,
  ready,
  onSelect,
  onDialNumber,
  onClear,
  onIncoming,
}: {
  history: History[]
  inCall: boolean
  demo: boolean
  ready: boolean
  onSelect: (peer: string) => void
  onDialNumber: (peer: string) => void
  onClear: () => void
  onIncoming: () => void
}) {
  const [filter, setFilter] = useState<'all' | 'missed'>('all')
  const missedCount = history.filter(item => ['missed', 'failed', 'unknown'].includes(item.outcome)).length
  const filtered = filter === 'missed'
    ? history.filter(item => ['missed', 'failed', 'unknown'].includes(item.outcome))
    : history

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader
        title="通话记录"
        description={`本次客户端会话 · 共 ${history.length} 条`}
      >
        <Tabs
          value={filter}
          onValueChange={val => runViewTransition(() => setFilter(val as 'all' | 'missed'), 'filter')}
        >
          <TabsList size="sm" className="h-7.5">
            <TabsTab value="all" className="px-2.5 text-xs sm:text-xs">会话 ({history.length})</TabsTab>
            <TabsTab value="missed" className="px-2.5 text-xs sm:text-xs">未接/异常 ({missedCount})</TabsTab>
          </TabsList>
        </Tabs>
        {demo && (
          <Button variant="outline" size="xs" className="h-7.5 px-2.5 text-xs sm:h-7.5 sm:text-xs" disabled={!ready || inCall} onClick={onIncoming}>
            <PhoneIncoming size={14} />模拟来电
          </Button>
        )}
        <Button variant="ghost" size="xs" className="h-7.5 px-2.5 text-xs sm:h-7.5 sm:text-xs" disabled={!history.length} aria-label="清空本次通话记录" onClick={onClear}>
          <Trash2 size={14} /><span className="max-sm:hidden">清空</span>
        </Button>
      </ViewHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-5">
          <Card className="flex-1 py-0 shadow-sm">
            <CardPanel className="flex flex-1 flex-col p-4 sm:p-5">
              {filtered.length ? (
                <div>
                  <div className="hidden grid-cols-[2rem_minmax(0,1fr)_6.5rem_5rem_4rem_3.5rem] items-center gap-3 border-b border-border px-3 pb-2.5 text-xs font-medium text-muted-foreground md:grid">
                    <span aria-hidden="true" />
                    <span>号码</span>
                    <span>结果</span>
                    <span>时间</span>
                    <span>时长</span>
                    <span className="text-right">操作</span>
                  </div>
                  <ul className="divide-y divide-border">
                    {filtered.map(item => (
                      <li key={item.id}>
                        <HistoryRow
                          item={item}
                          disabled={inCall}
                          ready={ready}
                          onSelect={() => onSelect(item.peer)}
                          onDial={() => onDialNumber(item.peer)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <Empty className="flex-1">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <HistoryIcon size={20} strokeWidth={1.6} />
                    </EmptyMedia>
                    <EmptyTitle className="text-sm">{filter === 'missed' ? '没有未接或异常记录' : '还没有通话记录'}</EmptyTitle>
                    <EmptyDescription className="text-xs">
                      {filter === 'missed' ? '所有未接来电或呼叫失败记录都会归类到这里。' : '拨出或接听电话后，记录会显示在这里。'}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardPanel>
          </Card>
        </div>
      </div>
    </div>
  )
}

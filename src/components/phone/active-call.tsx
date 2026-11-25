import { useEffect, useState, type ReactNode } from 'react'
import { AudioLines, Grid3x3, Mic, MicOff, Pause, Phone, PhoneCall, PhoneIncoming, PhoneOff, Play, Volume2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardPanel } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatClock } from '@/phone/format'
import { useCallClock } from '@/phone/hooks/use-call-clock'
import { directionLabel, phaseLabel } from '@/phone/labels'
import type { Call } from '@/phone/types'

const dtmfKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'] as const

function CallAction({ label, tone = 'outline', active, disabled, loading, onClick, children }: {
  label: string
  tone?: 'primary' | 'destructive' | 'outline'
  active?: boolean
  disabled?: boolean
  loading?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <div className="flex w-18 flex-col items-center gap-1.5">
      <Button
        variant={tone === 'primary' ? 'default' : tone === 'destructive' ? 'destructive' : active ? 'secondary' : 'outline'}
        size="icon-xl"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        loading={loading}
        onClick={onClick}
        className={cn(
          'size-14 rounded-full [&_svg]:size-5 sm:size-14 sm:[&_svg]:size-5',
          active && 'border-primary/50 bg-primary/15 text-primary hover:bg-primary/20',
        )}
      >
        {children}
      </Button>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  )
}

export function ActiveCall({
  call,
  muted,
  held,
  demo,
  onAnswer,
  onHangup,
  onMute,
  onToggleHold,
  onSendDtmf,
  onKeySound,
  onTestSound,
}: {
  call: Call
  muted: boolean
  held: boolean
  demo: boolean
  onAnswer: () => void
  onHangup: () => void
  onMute: () => void
  onToggleHold: () => void
  onSendDtmf: (digit: string) => void
  onKeySound: (digit?: string) => void
  onTestSound: () => void
}) {
  const clock = useCallClock(call.answered)
  const active = call.phase === 'connected'
  const incoming = call.phase === 'incoming'
  const ending = call.phase === 'ending'
  const [dtmfOpen, setDtmfOpen] = useState(false)
  const [dtmfLog, setDtmfLog] = useState('')

  useEffect(() => {
    setDtmfOpen(false)
    setDtmfLog('')
  }, [call.id])

  return (
    <div className="vt-call flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="mx-auto my-auto flex w-full max-w-[400px] flex-col items-center px-4 py-4 text-center">
        <Card className="w-full py-0">
          <CardPanel className="flex flex-col items-center px-5 py-6">
            <div className="relative">
              <div className={cn(
                'flex size-18 items-center justify-center rounded-full border bg-panel shadow-sm',
                active ? 'border-primary/30 text-primary' : incoming ? 'border-warning/40 text-warning' : 'border-border text-primary',
              )}>
                {incoming ? <PhoneIncoming size={28} /> : active ? <AudioLines size={28} /> : <PhoneCall size={28} />}
              </div>
              {(incoming || active) && (
                <span aria-hidden="true" className="call-pulse pointer-events-none absolute inset-0 rounded-full border border-primary/30" />
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
              <Badge variant="outline" size="sm" className="uppercase tracking-[0.12em]">
                {directionLabel[call.direction]}
              </Badge>
              {call.ownNumber && (
                <Badge variant="info" size="sm" title={`本机号码：${call.ownNumber}`}>
                  {call.direction === 'incoming' ? '本机接听' : '本机呼出'} · {call.ownNumber}
                </Badge>
              )}
              {call.transferSource && (
                <Badge variant="warning" size="sm" title={call.transferReason ? `AI 转人工原因：${call.transferReason}` : 'AI 智能前台转人工'}>
                  AI 转人工{call.transferReason ? ` · ${call.transferReason}` : ''}
                </Badge>
              )}
              {muted && active && (
                <Badge variant="warning" size="sm">麦克风已静音 (M)</Badge>
              )}
              {held && active && (
                <Badge variant="warning" size="sm">通话已保持 (H)</Badge>
              )}
            </div>

            <h2 className="mt-2.5 max-w-full break-all font-mono text-2xl tracking-[0.03em]">{call.peer}</h2>

            <p className="mt-1 flex items-center justify-center gap-2 text-xs text-muted-foreground" role="status">
              <span aria-hidden="true" className={cn('size-1.5 rounded-full', active ? 'bg-success' : incoming ? 'bg-warning status-pulse' : 'bg-muted-foreground')} />
              {phaseLabel[call.phase]}
              {call.answered && clock && <span className="font-mono font-semibold tabular-nums text-foreground">· {clock}</span>}
            </p>

            {!call.answered && (
              <div className="mt-2 font-sans text-xs text-muted-foreground">等待接通</div>
            )}

            <p className="mt-1 text-[11px] text-muted-foreground">
              {formatClock(call.started)} 开始{call.answered ? ` · ${formatClock(call.answered)} 接通` : ''}
              {demo ? ' · 本地演示' : ''}
            </p>

            <div className="mt-5 flex flex-wrap items-start justify-center gap-3 sm:gap-4">
              {incoming ? (
                <>
                  <CallAction label="接听" tone="primary" onClick={onAnswer}><Phone /></CallAction>
                  <CallAction label="拒接" tone="destructive" onClick={onHangup}><PhoneOff /></CallAction>
                </>
              ) : (
                <>
                  <CallAction label={muted ? '取消静音' : '静音'} active={muted} disabled={!active} onClick={onMute}>
                    {muted ? <MicOff /> : <Mic />}
                  </CallAction>
                  <CallAction label={held ? '恢复通话' : '保持'} active={held} disabled={!active} onClick={onToggleHold}>
                    {held ? <Play /> : <Pause />}
                  </CallAction>
                  <CallAction label={dtmfOpen ? '收起按键' : '按键'} active={dtmfOpen && active} disabled={!active} onClick={() => setDtmfOpen(v => !v)}>
                    <Grid3x3 />
                  </CallAction>
                  <CallAction label="测试声音" onClick={onTestSound}><Volume2 /></CallAction>
                  <CallAction
                    label={ending ? '正在结束' : active ? '挂断' : '取消呼叫'}
                    tone="destructive"
                    disabled={ending}
                    loading={ending}
                    onClick={onHangup}
                  >
                    <PhoneOff />
                  </CallAction>
                </>
              )}
            </div>
          </CardPanel>
        </Card>

        {active && dtmfOpen && (
          <Card className="mt-3 w-full max-w-[240px] py-0">
            <CardPanel className="p-2.5">
              <div className="mb-2 flex h-6 items-center justify-between rounded bg-background px-2 font-mono text-xs text-foreground">
                <span className="truncate">{dtmfLog || 'DTMF 按键（支持键盘 0-9 / * / #）'}</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {dtmfKeys.map(digit => (
                  <Button
                    key={digit}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 font-mono text-sm"
                    onClick={() => {
                      onKeySound(digit)
                      onSendDtmf(digit)
                      setDtmfLog(prev => (prev + digit).slice(-20))
                    }}
                  >
                    {digit}
                  </Button>
                ))}
              </div>
            </CardPanel>
          </Card>
        )}
      </div>
    </div>
  )
}

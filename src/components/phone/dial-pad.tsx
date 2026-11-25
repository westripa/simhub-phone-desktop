import { Phone, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const keys = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
  ['*', ''], ['0', '+'], ['#', ''],
]

function DialKey({ digit, letters, disabled, onPress, onClick }: {
  digit: string
  letters: string
  disabled?: boolean
  onPress: () => void
  onClick: (fromKeyboard: boolean) => void
}) {
  return (
    <Button
      variant="outline"
      disabled={disabled}
      title={disabled ? '拨号输入框仅支持数字与 +；通话中可使用按键盘发送 * / #' : undefined}
      aria-label={`输入${digit}`}
      onPointerDown={() => { if (!disabled) onPress() }}
      onClick={event => onClick(event.detail === 0)}
      className="h-11.5 flex-col justify-center gap-1 overflow-hidden rounded-xl border-border/85 bg-background/70 px-2 py-1.5 font-normal shadow-none transition-colors hover:border-primary/50 hover:bg-accent data-pressed:bg-accent disabled:opacity-35 sm:h-12.5"
    >
      <span className="font-mono text-xl font-semibold leading-none tabular-nums text-foreground">{digit}</span>
      <span className="block h-2.5 text-[10px] font-medium uppercase leading-none tracking-[0.16em] text-muted-foreground">
        {letters || '\u00a0'}
      </span>
    </Button>
  )
}

export function DialPad({ number, lastNumber, ready, connecting, statusSummary, onNumberChange, onDial, onKeySound }: {
  number: string
  lastNumber?: string
  ready: boolean
  connecting: boolean
  statusSummary: string
  onNumberChange: (value: string) => void
  onDial: () => void
  onKeySound: (digit?: string) => void
}) {
  return (
    <form
      className="flex flex-col"
      onSubmit={event => {
        event.preventDefault()
        if (!number.trim() && lastNumber) {
          onNumberChange(lastNumber)
          return
        }
        if (ready && number.trim()) onDial()
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <label htmlFor="dial-number" className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn('size-2 shrink-0 rounded-full', ready ? 'bg-success' : connecting ? 'bg-warning status-pulse' : 'bg-muted-foreground')}
          />
          <span className="truncate font-medium">{statusSummary}</span>
        </label>
        <div className="flex shrink-0 items-center gap-1">
          {!number && lastNumber && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              title={`填入上一通号码 ${lastNumber}`}
              className="h-6 gap-1 px-2 font-mono text-xs text-primary"
              onClick={() => onNumberChange(lastNumber)}
            >
              <RotateCcw size={12} />重拨
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-6 px-2 font-mono text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onNumberChange(number.startsWith('+') ? number : `+${number}`)}
          >
            + 国际冠码
          </Button>
          {number.length > 0 && (
            <span className="font-mono text-xs tabular-nums text-muted-foreground/80">{number.length}/20</span>
          )}
        </div>
      </div>

      <div className="relative">
        <Input
          id="dial-number"
          value={number}
          onChange={event => onNumberChange(event.target.value.slice(0, 20))}
          onKeyDown={event => { if (/^[0-9+]$/.test(event.key)) onKeySound(event.key) }}
          placeholder="输入电话号码"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          className="h-12 rounded-xl border border-border bg-background/85 shadow-xs has-focus-visible:border-primary/70 has-focus-visible:ring-1 has-focus-visible:ring-ring/30 sm:h-13 [&_input]:h-full [&_input]:px-10 [&_input]:text-center [&_input]:font-mono [&_input]:text-xl [&_input]:tracking-[0.05em] [&_input]:tabular-nums sm:[&_input]:text-2xl [&_input]:placeholder:font-sans [&_input]:placeholder:text-sm [&_input]:placeholder:tracking-normal [&_input]:placeholder:text-muted-foreground/60"
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="清空号码"
          title="清空号码"
          disabled={!number}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-0 sm:size-7"
          onClick={() => onNumberChange('')}
        >
          <X size={15} />
        </Button>
      </div>

      <div className="mt-2.5 grid w-full grid-cols-3 gap-2" role="group" aria-label="拨号键盘">
        {keys.map(([digit, letters]) => (
          <DialKey
            key={digit}
            digit={digit}
            letters={letters}
            disabled={digit === '*' || digit === '#'}
            onPress={() => onKeySound(digit)}
            onClick={fromKeyboard => {
              if (fromKeyboard) onKeySound(digit)
              onNumberChange((number + digit).slice(0, 20))
            }}
          />
        ))}
      </div>

      <Button type="submit" size="lg" disabled={!ready || !number.trim()} className="mt-3 h-10.5 w-full rounded-xl text-sm font-semibold shadow-sm sm:h-11 sm:text-sm">
        <Phone size={16} />呼叫
      </Button>
    </form>
  )
}

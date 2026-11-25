import { cn } from '@/lib/utils'
import type { Connection } from '@/phone/types'

const lightDot: Record<Connection, string> = {
  offline: 'bg-muted-foreground',
  connecting: 'bg-warning status-pulse',
  registered: 'bg-success',
  error: 'bg-destructive',
}

const darkDot: Record<Connection, string> = {
  offline: 'bg-rail-foreground/50',
  connecting: 'bg-statusbar-warning status-pulse',
  registered: 'bg-statusbar-online',
  error: 'bg-statusbar-error',
}

export function ConnectionDot({ connection, variant = 'light', className }: {
  connection: Connection
  variant?: 'light' | 'dark'
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('size-2 shrink-0 rounded-full', (variant === 'dark' ? darkDot : lightDot)[connection], className)}
    />
  )
}

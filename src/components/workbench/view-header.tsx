import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'

export function ViewHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-4 border-b border-border px-4 sm:px-6">
      <div className="flex min-w-0 items-baseline gap-2.5">
        <h1 className="truncate text-[13px] font-semibold tracking-tight">{title}</h1>
        {description && <p className="hidden truncate text-xs text-muted-foreground sm:block">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-1.5">{children}</div>}
    </header>
  )
}

export function ModeBadge({ demo }: { demo: boolean }) {
  return (
    <Badge variant={demo ? 'secondary' : 'outline'} size="sm" className="uppercase tracking-[0.12em]">
      {demo ? '演示' : 'SIP'}
    </Badge>
  )
}

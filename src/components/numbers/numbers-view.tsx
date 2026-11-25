import { useMemo, useRef, useState } from 'react'
import { ViewHeader } from '@/components/workbench/view-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { AccountSlot } from '@/phone/sip/pool'
import { normalizeAccountGroup, type Account } from '@/phone/types'
import { NumberGroupsPanel } from './number-groups-panel'
import { ProvisioningPanel } from './provisioning-panel'

export function NumbersView({
  account,
  accounts,
  defaultAccountKey,
  busyCallKey,
  onBindBatch,
  onSaveAccount,
  onConnectKey,
  onDisconnectKey,
  onRemoveKey,
  onSelectDefault,
  onDialWithAccount,
  onUpdateMeta,
  onSwitchToDemo,
}: {
  account: Account
  accounts: AccountSlot[]
  defaultAccountKey: string
  busyCallKey?: string
  onBindBatch: (accounts: Account[]) => Promise<void> | void
  onSaveAccount: (account: Account) => Promise<void> | void
  onConnectKey: (key: string) => void
  onDisconnectKey: (key: string) => void
  onRemoveKey: (key: string) => void
  onSelectDefault: (key: string) => void
  onDialWithAccount: (key: string) => void
  onUpdateMeta: (key: string, meta: { label?: string; group?: string }) => void
  onSwitchToDemo: () => void
}) {
  const [editing, setEditing] = useState<Account | null>(null)
  const provInputRef = useRef<HTMLTextAreaElement>(null)

  const existingGroups = useMemo(() => {
    const set = new Set<string>()
    for (const s of accounts) {
      set.add(normalizeAccountGroup(s.account.group))
    }
    return [...set]
  }, [accounts])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader
        title="号码绑定与号码组"
        description="导入标准 SIP 配网、按组归类管理本端号码并切换出局主叫"
      >
        <Badge variant={account.mode === 'demo' ? 'warning' : 'success'} size="sm">
          {account.mode === 'demo' ? '当前为本地演示模式' : '标准 SIP 模式'}
        </Badge>
        {account.mode === 'sip' && (
          <Button type="button" variant="ghost" size="xs" disabled={Boolean(busyCallKey)} onClick={onSwitchToDemo}>
            切回演示模式
          </Button>
        )}
      </ViewHeader>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 p-3.5 sm:p-5 @min-[800px]/main:grid-cols-[360px_minmax(0,1fr)]">
          <ProvisioningPanel
            existingGroups={existingGroups}
            defaultServer={account.server}
            defaultDomain={account.domain}
            editingAccount={editing}
            onBindBatch={onBindBatch}
            onSaveAccount={onSaveAccount}
            onClearEditing={() => setEditing(null)}
            inputRef={provInputRef}
          />
          <NumberGroupsPanel
            accounts={accounts}
            defaultAccountKey={defaultAccountKey}
            busyCallKey={busyCallKey}
            onSelectDefault={onSelectDefault}
            onDialWithAccount={onDialWithAccount}
            onConnectKey={onConnectKey}
            onDisconnectKey={onDisconnectKey}
            onEditAccount={acc => setEditing(acc)}
            onRemoveKey={onRemoveKey}
            onUpdateMeta={onUpdateMeta}
            onFocusProvisioning={() => provInputRef.current?.focus()}
          />
        </div>
      </ScrollArea>
    </div>
  )
}

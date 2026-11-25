import { useMemo, useState } from 'react'
import { Check, Edit3, Folder, Layers, Phone, Plug, Power, Search, Trash2 } from 'lucide-react'
import { ConnectionDot } from '@/components/phone/connection-dot'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
import { connectionLabel } from '@/phone/labels'
import type { AccountSlot } from '@/phone/sip/pool'
import { accountDisplayNumber, hasAccountCredential, normalizeAccountGroup, type Account, type Connection } from '@/phone/types'
import { runViewTransition } from '@/phone/view-transition'

const ALL_GROUPS_TAB = '__all__'

const statusBadgeVariant: Record<Connection, 'success' | 'warning' | 'error' | 'outline'> = {
  registered: 'success',
  connecting: 'warning',
  error: 'error',
  offline: 'outline',
}

function NumberSlotCard({
  slot,
  isDefault,
  inCall,
  onSelectDefault,
  onDialWithAccount,
  onConnectKey,
  onDisconnectKey,
  onEditAccount,
  onRemoveKey,
  onUpdateMeta,
}: {
  slot: AccountSlot
  isDefault: boolean
  inCall: boolean
  onSelectDefault: (key: string) => void
  onDialWithAccount: (key: string) => void
  onConnectKey: (key: string) => void
  onDisconnectKey: (key: string) => void
  onEditAccount: (account: Account) => void
  onRemoveKey: (key: string) => void
  onUpdateMeta: (key: string, meta: { label?: string; group?: string }) => void
}) {
  const [editingMeta, setEditingMeta] = useState(false)
  const [labelInput, setLabelInput] = useState(slot.account.label ?? '')
  const [groupInput, setGroupInput] = useState(slot.account.group ?? '')

  const online = slot.status === 'registered'
  const connecting = slot.status === 'connecting'
  const hasCred = hasAccountCredential(slot.account)
  const groupName = normalizeAccountGroup(slot.account.group)
  const shownNumber = accountDisplayNumber(slot.account)

  return (
    <Card className="rounded-xl border-border bg-panel/95 shadow-xs transition-colors hover:border-border-strong">
      <CardPanel className="grid gap-3 p-3.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <ConnectionDot connection={slot.status} className="mt-1.5" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate font-mono text-sm font-semibold text-foreground">{shownNumber}</span>
                {slot.account.label && (
                  <Badge variant="secondary" size="sm">{slot.account.label}</Badge>
                )}
                <Badge variant="outline" size="sm">
                  <Folder size={10} />{groupName}
                </Badge>
                {isDefault && (
                  <Badge variant="info" size="sm">默认主叫</Badge>
                )}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {slot.account.phoneNumber ? `${slot.account.username}@${slot.account.domain}` : `@${slot.account.domain}`} · {slot.account.server}
              </p>
              <p className={slot.status === 'error' && slot.message ? 'mt-0.5 text-[11px] text-destructive' : 'mt-0.5 text-[11px] text-muted-foreground'}>
                {slot.status === 'error' && slot.message
                  ? slot.message
                  : (
                    <>
                      {online ? '已就绪，可接听来电与外呼' : hasCred ? '内存凭据已就绪，可直接上线' : '已记忆配置；本次会话未加载 HA1 / 密码'}
                      {slot.message ? ` · ${slot.message}` : ''}
                    </>
                  )}
              </p>
            </div>
          </div>

          <Badge variant={statusBadgeVariant[slot.status]} size="sm">
            {connectionLabel[slot.status]}
          </Badge>
        </div>

        {editingMeta && (
          <div className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-background/70 p-2.5 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              size="sm"
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              placeholder="备注标签（如：客服A）"
            />
            <Input
              size="sm"
              list="simhub-known-groups"
              value={groupInput}
              onChange={e => setGroupInput(e.target.value)}
              placeholder="号码组（留空归入默认分组）"
            />
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="xs"
                onClick={() => {
                  onUpdateMeta(slot.key, { label: labelInput, group: groupInput })
                  setEditingMeta(false)
                }}
              >
                <Check size={12} />保存
              </Button>
              <Button type="button" variant="ghost" size="xs" onClick={() => setEditingMeta(false)}>取消</Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
          {online && (
            <Button type="button" size="xs" onClick={() => onDialWithAccount(slot.key)}>
              <Phone size={12} />去拨号
            </Button>
          )}
          {!isDefault && (
            <Button type="button" variant="outline" size="xs" onClick={() => onSelectDefault(slot.key)}>
              设为主叫
            </Button>
          )}
          {online || connecting ? (
            <Button type="button" variant="outline" size="xs" disabled={inCall} onClick={() => onDisconnectKey(slot.key)}>
              <Power size={12} />断开
            </Button>
          ) : hasCred ? (
            <Button type="button" variant="outline" size="xs" onClick={() => onConnectKey(slot.key)}>
              <Plug size={12} />上线
            </Button>
          ) : (
            <Button type="button" variant="secondary" size="xs" onClick={() => onEditAccount(slot.account)}>
              重新导入 / 填密
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              setLabelInput(slot.account.label ?? '')
              setGroupInput(slot.account.group ?? '')
              setEditingMeta(v => !v)
            }}
          >
            <Edit3 size={12} />分组/备注
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={inCall}
            className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onRemoveKey(slot.key)}
          >
            <Trash2 size={12} />解绑
          </Button>
        </div>
      </CardPanel>
    </Card>
  )
}

export function NumberGroupsPanel({
  accounts,
  defaultAccountKey,
  busyCallKey,
  onSelectDefault,
  onDialWithAccount,
  onConnectKey,
  onDisconnectKey,
  onEditAccount,
  onRemoveKey,
  onUpdateMeta,
  onFocusProvisioning,
}: {
  accounts: AccountSlot[]
  defaultAccountKey: string
  busyCallKey?: string
  onSelectDefault: (key: string) => void
  onDialWithAccount: (key: string) => void
  onConnectKey: (key: string) => void
  onDisconnectKey: (key: string) => void
  onEditAccount: (account: Account) => void
  onRemoveKey: (key: string) => void
  onUpdateMeta: (key: string, meta: { label?: string; group?: string }) => void
  onFocusProvisioning?: () => void
}) {
  const [groupTab, setGroupTab] = useState<string>(ALL_GROUPS_TAB)
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const counts = new Map<string, number>()
    for (const slot of accounts) {
      const g = normalizeAccountGroup(slot.account.group)
      counts.set(g, (counts.get(g) ?? 0) + 1)
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }))
  }, [accounts])

  const activeGroup = groupTab === ALL_GROUPS_TAB || groups.some(g => g.name === groupTab)
    ? groupTab
    : ALL_GROUPS_TAB

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return accounts.filter(slot => {
      const g = normalizeAccountGroup(slot.account.group)
      if (activeGroup !== ALL_GROUPS_TAB && g !== activeGroup) return false
      if (!q) return true
      return (
        slot.account.username.toLowerCase().includes(q)
        || (slot.account.phoneNumber ?? '').toLowerCase().includes(q)
        || slot.account.domain.toLowerCase().includes(q)
        || (slot.account.label ?? '').toLowerCase().includes(q)
        || g.toLowerCase().includes(q)
      )
    })
  }, [accounts, activeGroup, query])

  const onlineCount = accounts.filter(s => s.status === 'registered').length

  return (
    <Card className="rounded-xl border-border bg-panel/70 shadow-xs">
      <CardHeader className="gap-3 px-4 pt-4 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold">号码组与已绑定号码</CardTitle>
            <CardDescription className="text-xs">
              支持多号并发在线、按组管理、并随时切换拨号台出局主叫。
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" size="sm">共 {accounts.length} 号</Badge>
            <Badge variant={onlineCount > 0 ? 'success' : 'outline'} size="sm">{onlineCount} 在线</Badge>
            <Badge variant="outline" size="sm">{groups.length || 0} 组</Badge>
          </div>
        </div>

        {accounts.length > 0 && (
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <Tabs
              value={activeGroup}
              onValueChange={next => runViewTransition(() => setGroupTab(String(next)), 'filter')}
            >
              <TabsList className="max-w-full flex-wrap" size="sm">
                <TabsTab value={ALL_GROUPS_TAB}>全部 ({accounts.length})</TabsTab>
                {groups.map(g => (
                  <TabsTab key={g.name} value={g.name}>{g.name} ({g.count})</TabsTab>
                ))}
              </TabsList>
            </Tabs>

            <div className="relative w-full sm:w-52">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                size="sm"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="筛选号码 / 备注 / 组…"
                className="[&_input]:pl-7"
              />
            </div>
          </div>
        )}
      </CardHeader>

      <CardPanel className="px-4 pt-0 pb-4">
        {accounts.length === 0 ? (
          <Empty className="rounded-xl border border-dashed border-border bg-background/50 py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Layers />
              </EmptyMedia>
              <EmptyTitle className="text-base">尚未绑定 SIP 号码</EmptyTitle>
              <EmptyDescription className="text-xs">
                在左侧粘贴来自 <span className="font-mono">/inter</span> 或平台的配网链接（支持单号或批量多号 JSON/XML），即可叠加绑定到不同号码组。
              </EmptyDescription>
            </EmptyHeader>
            {onFocusProvisioning && (
              <EmptyContent>
                <Button type="button" size="sm" onClick={onFocusProvisioning}>开始绑定第一个号码</Button>
              </EmptyContent>
            )}
          </Empty>
        ) : filtered.length === 0 ? (
          <Empty className="rounded-xl border border-dashed border-border bg-background/50 py-8">
            <EmptyHeader>
              <EmptyTitle className="text-sm">当前筛选下没有匹配的号码</EmptyTitle>
              <EmptyDescription className="text-xs">可以清空搜索关键词或切换到“全部”分组查看。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-2.5">
            {filtered.map(slot => (
              <NumberSlotCard
                key={slot.key}
                slot={slot}
                isDefault={slot.key === defaultAccountKey}
                inCall={busyCallKey === slot.key}
                onSelectDefault={onSelectDefault}
                onDialWithAccount={onDialWithAccount}
                onConnectKey={onConnectKey}
                onDisconnectKey={onDisconnectKey}
                onEditAccount={onEditAccount}
                onRemoveKey={onRemoveKey}
                onUpdateMeta={onUpdateMeta}
              />
            ))}
          </div>
        )}
      </CardPanel>
    </Card>
  )
}

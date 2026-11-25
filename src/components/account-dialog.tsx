import { useEffect, useState } from 'react'
import { ChevronDown, Download, Eye, EyeOff, KeyRound, Layers, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { ConnectionDot } from '@/components/phone/connection-dot'
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardPanel } from '@/components/ui/card'
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { connectionLabel } from '@/phone/labels'
import type { AccountSlot } from '@/phone/sip/pool'
import {
  resolveProvisioningInput,
  type ProvisionedAccountChoice,
  type ProvisioningImportResult,
} from '@/phone/sip/provisioning'
import { accountDisplayNumber, emptyAccount, hasAccountCredential, normalizeAccountGroup, validateAccount, type Account } from '@/phone/types'

function formatIceServers(servers?: RTCIceServer[]): string {
  if (!servers?.length) return ''
  return servers.flatMap(entry => (Array.isArray(entry.urls) ? entry.urls : [entry.urls])).join('\n')
}

function parseIceServers(raw: string): RTCIceServer[] | undefined {
  const urls = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  return urls.length ? urls.map(url => ({ urls: url })) : undefined
}

export function AccountDialog({
  open,
  onOpenChange,
  account,
  accounts,
  defaultAccountKey,
  busyCallKey,
  onConnect,
  onConnectBatch,
  onSave,
  onConnectKey,
  onDisconnectKey,
  onRemoveKey,
  onSelectDefault,
  onOpenNumbers,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: Account
  accounts: AccountSlot[]
  defaultAccountKey: string
  busyCallKey?: string
  onConnect: (account: Account) => void
  onConnectBatch: (accounts: Account[]) => void
  onSave: (account: Account) => void
  onConnectKey: (key: string) => void
  onDisconnectKey: (key: string) => void
  onRemoveKey: (key: string) => void
  onSelectDefault: (key: string) => void
  onOpenNumbers?: () => void
}) {
  const [draft, setDraft] = useState(account)
  const [iceText, setIceText] = useState(() => formatIceServers(account.iceServers))
  const [importText, setImportText] = useState('')
  const [imported, setImported] = useState<ProvisioningImportResult | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string>('')
  const [importing, setImporting] = useState(false)
  const [importNotice, setImportNotice] = useState('')
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraft(account)
    setIceText(formatIceServers(account.iceServers))
    setImportText('')
    setImported(null)
    setSelectedSlot('')
    setImporting(false)
    setImportNotice('')
    setError('')
    setShowPassword(false)
  }, [open, account])

  const update = (key: 'server' | 'domain' | 'username' | 'authorizationUsername' | 'label' | 'group', value: string) => {
    setDraft(previous => ({ ...previous, [key]: value }))
    setError('')
  }

  const modes = [
    { value: 'sip', label: '标准 SIP（WSS）' },
    { value: 'demo', label: '本地演示' },
  ]

  function applyImportedChoice(result: ProvisioningImportResult, choice: ProvisionedAccountChoice) {
    setSelectedSlot(String(choice.slot))
    setDraft(previous => ({
      ...previous,
      mode: 'sip',
      server: result.websocketUrl ?? previous.server,
      domain: choice.domain,
      username: choice.username,
      phoneNumber: choice.phoneNumber ?? '',
      authorizationUsername: choice.authorizationUsername ?? '',
      realm: choice.realm ?? '',
      ha1: choice.ha1,
      password: choice.password ?? '',
      label: choice.label ?? previous.label,
      group: choice.group ?? previous.group,
      registrationExpiresSeconds: result.registrationExpiresSeconds ?? previous.registrationExpiresSeconds,
    }))
    setError('')
  }

  async function handleImport() {
    const trimmed = importText.trim()
    if (!trimmed) {
      setError('请输入配网链接（支持每行一个批量导入），或粘贴 XML / linphonerc / JSON 配网内容。')
      return
    }
    setImporting(true)
    setImported(null)
    setError('')
    setImportNotice('')
    try {
      const { result, failures } = await resolveProvisioningInput(trimmed)
      setImported(result)
      const first = result.accounts[0]
      applyImportedChoice(result, first)
      const failNote = failures.length > 0 ? `（另有 ${failures.length} 条链接失败）` : ''
      if (!result.websocketUrl && !draft.server.trim()) {
        setImportNotice(`已解析 ${result.accounts.length} 个 SIP 账号${failNote}，请补充 WebSocket 服务器地址（wss://.../sip）。`)
      } else {
        setImportNotice(`已导入 ${result.accounts.length} 个 SIP 账号${failNote}，点击“连接账号”即可注册。`)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法解析配网内容。')
    } finally {
      setImporting(false)
    }
  }

  function buildBatchAccounts(): Account[] {
    if (!imported?.accounts.length) return []
    const server = (imported.websocketUrl ?? draft.server).trim()
    const iceServers = parseIceServers(iceText)
    return imported.accounts.map(choice => ({
      mode: 'sip',
      server,
      domain: choice.domain,
      username: choice.username,
      phoneNumber: choice.phoneNumber,
      authorizationUsername: choice.authorizationUsername,
      realm: choice.realm,
      ha1: choice.ha1,
      password: choice.password ?? '',
      label: choice.label,
      group: choice.group,
      registrationExpiresSeconds: imported.registrationExpiresSeconds ?? draft.registrationExpiresSeconds,
      iceServers,
      remember: draft.remember ?? true,
    }))
  }

  function handleBatchConnect() {
    const batch = buildBatchAccounts()
    if (!batch.length) return
    try {
      for (const acc of batch) validateAccount(acc, true)
      onConnectBatch(batch)
      onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '批量配网账号配置无效。')
    }
  }

  function submit(connect: boolean) {
    const iceServers = parseIceServers(iceText)
    const profile: Account = {
      ...draft,
      server: draft.server.trim(),
      domain: draft.domain.trim(),
      username: draft.username.trim(),
      phoneNumber: draft.phoneNumber?.trim() || undefined,
      label: draft.label?.trim() || undefined,
      group: draft.group?.trim() ? normalizeAccountGroup(draft.group) : undefined,
      authorizationUsername: draft.authorizationUsername?.trim() || undefined,
      realm: draft.realm?.trim() || undefined,
      ha1: draft.ha1?.trim().toLowerCase() || undefined,
      iceServers,
    }
    try {
      validateAccount(profile, connect)
      if (connect) onConnect(profile)
      else onSave(profile)
      onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '请检查账号设置。')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup bottomStickOnMobile={false} className="max-w-md" closeProps={{ 'aria-label': '关闭账号设置' }}>
        <DialogHeader>
          <DialogTitle>账号设置</DialogTitle>
          <DialogDescription>填写标准 SIP over WebSocket 账号，或导入 `/api/v1/provisioning` 配网数据。</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            id="account-form"
            className="grid gap-4"
            onSubmit={event => {
              event.preventDefault()
              submit(true)
            }}
          >
            <div className="grid gap-2">
              <Label id="mode-label">连接方式</Label>
              <Select
                items={modes}
                value={draft.mode}
                onValueChange={value => {
                  if (!value) return
                  setError('')
                  setDraft(previous => ({ ...previous, mode: value as Account['mode'] }))
                }}
              >
                <SelectTrigger aria-labelledby="mode-label"><SelectValue /></SelectTrigger>
                <SelectPopup>{modes.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectPopup>
              </Select>
            </div>

            {draft.mode === 'sip' ? (
              <>
                {onOpenNumbers && (
                  <Alert variant="info" className="py-2.5 text-xs">
                    <Layers />
                    <AlertDescription className="text-[11px]">
                      如需按号码组分类查看所有已绑号码、编辑备注或批量配网，可在独立“号码管理”工作台操作。
                    </AlertDescription>
                    <AlertAction>
                      <Button type="button" variant="outline" size="xs" onClick={onOpenNumbers}>
                        打开号码页
                      </Button>
                    </AlertAction>
                  </Alert>
                )}

                {accounts.length > 0 && (
                  <Card className="py-0">
                    <CardPanel className="grid gap-2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium">已添加 SIP 号码池 ({accounts.length})</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => {
                            setDraft({ ...emptyAccount, mode: 'sip', server: draft.server, domain: draft.domain, remember: true })
                            setError('')
                          }}
                        >
                          <Plus size={12} />新增账号
                        </Button>
                      </div>
                      <div className="grid max-h-40 gap-1.5 overflow-y-auto pr-0.5">
                        {accounts.map(slot => {
                          const isDefault = slot.key === defaultAccountKey
                          const inCall = busyCallKey === slot.key
                          const online = slot.status === 'registered'
                          const connecting = slot.status === 'connecting'
                          const canReconnect = hasAccountCredential(slot.account)
                          return (
                            <div key={slot.key} className="flex flex-wrap items-center gap-1.5 rounded-md border border-border/80 bg-background px-2.5 py-1.5 text-[11px]">
                              <ConnectionDot connection={slot.status} />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="truncate font-mono font-medium text-foreground">{accountDisplayNumber(slot.account)}</span>
                                  <span className="truncate text-muted-foreground">
                                    {slot.account.phoneNumber ? `${slot.account.username}@${slot.account.domain}` : `@${slot.account.domain}`}
                                  </span>
                                  {slot.account.group && (
                                    <Badge variant="outline" size="sm">{normalizeAccountGroup(slot.account.group)}</Badge>
                                  )}
                                  {isDefault && (
                                    <Badge variant="info" size="sm">默认主叫</Badge>
                                  )}
                                </div>
                                <div className="truncate text-[10px] text-muted-foreground">
                                  {slot.account.label ? `${slot.account.label} · ` : ''}{connectionLabel[slot.status]}{slot.message ? ` · ${slot.message}` : ''}
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                {!isDefault && (
                                  <Button type="button" variant="ghost" size="xs" onClick={() => onSelectDefault(slot.key)}>设为主叫</Button>
                                )}
                                {online || connecting ? (
                                  <Button type="button" variant="outline" size="xs" disabled={inCall} onClick={() => onDisconnectKey(slot.key)}>断开</Button>
                                ) : canReconnect ? (
                                  <Button type="button" variant="outline" size="xs" onClick={() => onConnectKey(slot.key)}>重连</Button>
                                ) : null}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => {
                                    setDraft({ ...slot.account })
                                    setIceText(formatIceServers(slot.account.iceServers))
                                    setError('')
                                  }}
                                >
                                  编辑
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={`移除 ${slot.account.username}`}
                                  disabled={inCall}
                                  onClick={() => onRemoveKey(slot.key)}
                                >
                                  <Trash2 size={12} />
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </CardPanel>
                  </Card>
                )}

                <Card className="bg-muted/25 py-0">
                  <CardPanel className="grid gap-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="sip-import" className="text-xs font-medium">导入标准配网（URL / XML / linphonerc / JSON）</Label>
                      <Button type="button" variant="outline" size="xs" loading={importing} onClick={() => void handleImport()}>
                        <Download size={12} />导入填充
                      </Button>
                    </div>
                    <Textarea
                      id="sip-import"
                      size="sm"
                      rows={2}
                      value={importText}
                      onChange={event => { setImportText(event.target.value); setError('') }}
                      placeholder="粘贴 https://.../api/v1/provisioning/<token> 或配网 XML / linphonerc / JSON"
                      spellCheck={false}
                      className="font-mono text-[11px] leading-relaxed"
                    />
                    {importNotice && <p className="text-[11px] text-primary">{importNotice}</p>}
                    {imported && imported.accounts.length > 0 && (
                      <div className="grid gap-1.5 pt-1">
                        {imported.accounts.length > 1 && (
                          <>
                            <Label id="slot-select-label" className="text-[11px] text-muted-foreground">填入单个账号预览</Label>
                            <Select
                              items={imported.accounts.map(acc => ({
                                value: String(acc.slot),
                                label: acc.phoneNumber ? `#${acc.slot} · ${acc.phoneNumber} (${acc.username})` : `#${acc.slot} · ${acc.username}@${acc.domain}`,
                              }))}
                              value={selectedSlot}
                              onValueChange={val => {
                                const found = imported.accounts.find(acc => String(acc.slot) === val)
                                if (found) applyImportedChoice(imported, found)
                              }}
                            >
                              <SelectTrigger aria-labelledby="slot-select-label" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectPopup>
                                {imported.accounts.map(acc => (
                                  <SelectItem key={acc.slot} value={String(acc.slot)}>
                                    {acc.phoneNumber ? `#${acc.slot} · ${acc.phoneNumber} (${acc.username})` : `#${acc.slot} · ${acc.username}@${acc.domain}`}
                                  </SelectItem>
                                ))}
                              </SelectPopup>
                            </Select>
                          </>
                        )}
                        <div className="flex justify-end pt-1">
                          <Button
                            type="button"
                            variant="secondary"
                            size="xs"
                            disabled={!(imported.websocketUrl ?? draft.server).trim()}
                            onClick={handleBatchConnect}
                          >
                            <Plus size={12} />
                            {imported.accounts.length > 1
                              ? `全部叠加导入并连接 (${imported.accounts.length} 个)`
                              : '叠加导入并连接此号码'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardPanel>
                </Card>

                <div className="grid gap-2">
                  <Label htmlFor="sip-server">WebSocket 服务器</Label>
                  <Input
                    id="sip-server"
                    value={draft.server}
                    onChange={event => update('server', event.target.value)}
                    placeholder="wss://服务器地址:8465/sip"
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">仅使用 SIP over WebSocket（WSS）；本机回环开发可用 ws://127.0.0.1。</p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="sip-domain">SIP 域名</Label>
                    <Input
                      id="sip-domain"
                      value={draft.domain}
                      onChange={event => update('domain', event.target.value)}
                      placeholder="例如 webrtc.local"
                      autoComplete="off"
                      spellCheck={false}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="sip-user">SIP 用户名</Label>
                    <Input
                      id="sip-user"
                      value={draft.username}
                      onChange={event => update('username', event.target.value)}
                      placeholder="+15550000001 或分机号"
                      autoComplete="off"
                      spellCheck={false}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="sip-group">号码分组（本地分类）</Label>
                    <Input
                      id="sip-group"
                      value={draft.group ?? ''}
                      onChange={event => update('group', event.target.value)}
                      placeholder="例如 客服组 / 外呼组"
                      autoComplete="off"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="sip-label">号码备注（选填）</Label>
                    <Input
                      id="sip-label"
                      value={draft.label ?? ''}
                      onChange={event => update('label', event.target.value)}
                      placeholder="例如 主叫线路 A"
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="sip-password">SIP 密码</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="sip-password"
                      type={showPassword ? 'text' : 'password'}
                      value={draft.password}
                      onChange={event => {
                        const value = event.target.value
                        setDraft(previous => ({
                          ...previous,
                          password: value,
                          ha1: value ? undefined : previous.ha1,
                        }))
                        setError('')
                      }}
                      autoComplete="off"
                      placeholder={draft.ha1 ? '已载入配网 HA1（可直接留空）' : '连接时填写；或从上方导入 HA1 配网'}
                    />
                    <Button type="button" variant="ghost" size="icon" aria-label={showPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                  {draft.ha1 && !draft.password && (
                    <Alert variant="info" className="py-2 text-[11px]">
                      <KeyRound />
                      <AlertDescription className="text-[11px]">已载入 Digest HA1 凭据（无需明文密码）</AlertDescription>
                      <AlertAction>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => setDraft(previous => ({ ...previous, ha1: undefined }))}
                        >
                          清除 HA1
                        </Button>
                      </AlertAction>
                    </Alert>
                  )}
                </div>

                <Collapsible>
                  <CollapsibleTrigger
                    render={(
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full justify-between text-xs font-medium text-muted-foreground"
                      >
                        <span>高级标准选项（认证用户名 / STUN / TURN）</span>
                        <ChevronDown size={14} />
                      </Button>
                    )}
                  />
                  <CollapsiblePanel>
                    <div className="mt-2 grid gap-3 rounded-lg border border-border/70 p-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor="sip-auth-user" className="text-xs">认证用户名（Auth ID，选填）</Label>
                        <Input
                          id="sip-auth-user"
                          value={draft.authorizationUsername ?? ''}
                          onChange={event => update('authorizationUsername', event.target.value)}
                          placeholder="留空则与 SIP 用户名一致"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="sip-ice" className="text-xs">STUN / TURN 服务器（选填，每行一个 URL）</Label>
                        <Textarea
                          id="sip-ice"
                          size="sm"
                          rows={2}
                          value={iceText}
                          onChange={event => { setIceText(event.target.value); setError('') }}
                          placeholder="stun:stun.example.invalid:3478"
                          spellCheck={false}
                          className="font-mono text-[11px]"
                        />
                      </div>
                    </div>
                  </CollapsiblePanel>
                </Collapsible>

                <Label className="flex items-center gap-2 text-xs leading-relaxed" htmlFor="remember-profile">
                  <Switch
                    id="remember-profile"
                    checked={draft.remember ?? false}
                    onCheckedChange={remember => setDraft(previous => ({ ...previous, remember }))}
                  />
                  记住非敏感配置（服务器、域名、用户名；不含密码与 HA1）
                </Label>
                <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground [&>svg]:shrink-0">
                  <ShieldCheck size={16} />密码与 HA1 凭据仅留存在当前内存，断开或关闭后需重新导入或填写。
                </p>
              </>
            ) : (
              <Alert>
                <AlertDescription className="text-xs leading-relaxed">
                  体验拨出、来电、接听和挂断。演示不会连接服务器，也不会拨打真实电话。
                </AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="error" className="py-2 text-xs">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </form>
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          {draft.mode !== 'demo' && <Button variant="outline" onClick={() => submit(false)}>保存设置</Button>}
          <Button form="account-form" type="submit">
            {draft.mode === 'demo' ? '开始本地演示' : '连接账号'}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  )
}

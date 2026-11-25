import { useEffect, useState } from 'react'
import { ChevronDown, Download, Eye, EyeOff, FolderPlus, Info, KeyRound, Plus, ShieldCheck } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  resolveProvisioningInput,
  type ProvisionedAccountChoice,
  type ProvisioningImportResult,
} from '@/phone/sip/provisioning'
import { emptyAccount, normalizeAccountGroup, validateAccount, type Account } from '@/phone/types'
import { runViewTransition } from '@/phone/view-transition'

function parseIceServers(raw: string): RTCIceServer[] | undefined {
  const urls = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  return urls.length ? urls.map(url => ({ urls: url })) : undefined
}

function formatIceServers(servers?: RTCIceServer[]): string {
  if (!servers?.length) return ''
  return servers.flatMap(entry => (Array.isArray(entry.urls) ? entry.urls : [entry.urls])).join('\n')
}

export function ProvisioningPanel({
  existingGroups,
  defaultServer = '',
  defaultDomain = '',
  editingAccount,
  onBindBatch,
  onSaveAccount,
  onClearEditing,
  inputRef,
}: {
  existingGroups: string[]
  defaultServer?: string
  defaultDomain?: string
  editingAccount?: Account | null
  onBindBatch: (accounts: Account[]) => Promise<void> | void
  onSaveAccount: (account: Account) => Promise<void> | void
  onClearEditing?: () => void
  inputRef?: React.RefObject<HTMLTextAreaElement | null>
}) {
  const [tab, setTab] = useState<'prov' | 'manual'>('prov')
  const [importText, setImportText] = useState('')
  const [importGroup, setImportGroup] = useState('')
  const [importLabel, setImportLabel] = useState('')
  const [imported, setImported] = useState<ProvisioningImportResult | null>(null)
  const [selectedSlot, setSelectedSlot] = useState('')
  const [provServer, setProvServer] = useState(defaultServer)
  const [importing, setImporting] = useState(false)
  const [importNotice, setImportNotice] = useState('')
  const [partialFailures, setPartialFailures] = useState<string[]>([])
  const [provError, setProvError] = useState('')

  const [draft, setDraft] = useState<Account>(() => ({
    ...emptyAccount,
    mode: 'sip',
    server: defaultServer,
    domain: defaultDomain,
    remember: true,
  }))
  const [iceText, setIceText] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [manualError, setManualError] = useState('')

  useEffect(() => {
    if (!editingAccount) return
    setTab('manual')
    setDraft({
      ...editingAccount,
      mode: 'sip',
      remember: editingAccount.remember ?? true,
    })
    setIceText(formatIceServers(editingAccount.iceServers))
    setManualError('')
  }, [editingAccount])

  useEffect(() => {
    if (defaultServer && !provServer) setProvServer(defaultServer)
  }, [defaultServer, provServer])

  function applyChoiceToManual(result: ProvisioningImportResult, choice: ProvisionedAccountChoice) {
    setSelectedSlot(String(choice.slot))
    setDraft(previous => ({
      ...previous,
      mode: 'sip',
      server: result.websocketUrl ?? (provServer.trim() || previous.server),
      domain: choice.domain,
      username: choice.username,
      phoneNumber: choice.phoneNumber ?? '',
      authorizationUsername: choice.authorizationUsername ?? '',
      realm: choice.realm ?? '',
      label: choice.label ?? (importLabel.trim() || previous.label),
      group: choice.group ?? (importGroup.trim() || previous.group),
      ha1: choice.ha1,
      password: choice.password ?? '',
      registrationExpiresSeconds: result.registrationExpiresSeconds ?? previous.registrationExpiresSeconds,
      remember: true,
    }))
    setManualError('')
  }

  async function handleParse() {
    const trimmed = importText.trim()
    if (!trimmed) {
      setProvError('请粘贴配网链接（支持每行一个批量导入）或 XML / linphonerc / JSON 内容。')
      return
    }
    setImporting(true)
    setImported(null)
    setProvError('')
    setImportNotice('')
    setPartialFailures([])
    try {
      const { result, failures } = await resolveProvisioningInput(trimmed)
      setImported(result)
      setPartialFailures(failures)
      if (result.websocketUrl) setProvServer(result.websocketUrl)
      if (result.accounts[0]) {
        applyChoiceToManual(result, result.accounts[0])
      }
      setImportNotice(
        failures.length > 0
          ? `已解析 ${result.accounts.length} 个 SIP 号码（另有 ${failures.length} 条链接失败）。`
          : `解析成功，共识别 ${result.accounts.length} 个 SIP 号码，可直接全部叠加绑定。`,
      )
    } catch (cause) {
      setProvError(cause instanceof Error ? cause.message : '无法解析配网内容。')
    } finally {
      setImporting(false)
    }
  }

  async function handleBatchBind() {
    if (!imported?.accounts.length) return
    const server = (imported.websocketUrl ?? provServer).trim()
    if (!server) {
      setProvError('该配网文本缺少 WebSocket 地址，请在下方补充 wss://.../sip 后再绑定。')
      return
    }
    const targetGroup = importGroup.trim()
    const targetLabel = importLabel.trim()
    const batch: Account[] = imported.accounts.map((choice, idx) => ({
      mode: 'sip',
      server,
      domain: choice.domain,
      username: choice.username,
      phoneNumber: choice.phoneNumber,
      authorizationUsername: choice.authorizationUsername,
      realm: choice.realm,
      ha1: choice.ha1,
      password: choice.password ?? '',
      label: choice.label ?? (imported.accounts.length === 1 && targetLabel ? targetLabel : undefined) ?? (targetLabel ? `${targetLabel} #${idx + 1}` : undefined),
      group: choice.group ?? (targetGroup ? normalizeAccountGroup(targetGroup) : undefined),
      registrationExpiresSeconds: imported.registrationExpiresSeconds,
      iceServers: parseIceServers(iceText),
      remember: true,
    }))
    try {
      for (const acc of batch) validateAccount(acc, true)
      await onBindBatch(batch)
      setImportText('')
      setImported(null)
      setPartialFailures([])
      setImportNotice(`已成功叠加绑定并连接 ${batch.length} 个号码。`)
    } catch (cause) {
      setProvError(cause instanceof Error ? cause.message : '批量绑定失败，请检查配网参数。')
    }
  }

  async function handleManualSubmit(connectNow: boolean) {
    const profile: Account = {
      ...draft,
      mode: 'sip',
      server: draft.server.trim(),
      domain: draft.domain.trim(),
      username: draft.username.trim(),
      phoneNumber: draft.phoneNumber?.trim() || undefined,
      label: draft.label?.trim() || undefined,
      group: draft.group?.trim() ? normalizeAccountGroup(draft.group) : undefined,
      authorizationUsername: draft.authorizationUsername?.trim() || undefined,
      realm: draft.realm?.trim() || undefined,
      ha1: draft.ha1?.trim().toLowerCase() || undefined,
      iceServers: parseIceServers(iceText),
    }
    try {
      validateAccount(profile, connectNow)
      if (connectNow) {
        await onBindBatch([profile])
      } else {
        await onSaveAccount(profile)
      }
      setManualError('')
      onClearEditing?.()
    } catch (cause) {
      setManualError(cause instanceof Error ? cause.message : '请检查 SIP 账号字段。')
    }
  }

  return (
    <Card className="h-fit rounded-xl border-border bg-panel/90 shadow-xs">
      <CardHeader className="gap-1 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold">导入与绑定 SIP 号码</CardTitle>
          <Badge variant="outline" size="sm">标准 SIP / WSS</Badge>
        </div>
        <CardDescription className="text-xs leading-relaxed">
          按 <span className="font-mono">username@domain</span> 向后叠加绑定号码，不会覆盖已有配置或打断在线号码。
        </CardDescription>
      </CardHeader>

      <CardPanel className="grid gap-3.5 px-4 pt-0 pb-4">
        <Alert variant="info" className="px-3 py-2 text-[11px] leading-relaxed">
          <Info className="size-3.5" />
          <AlertTitle className="text-[11px] font-semibold">绑定与分组范围说明</AlertTitle>
          <AlertDescription className="text-[11px]">
            此处展示和绑定当前客户端导入使用的号码与本地号码组；网关卡池线路开户与批量分配仍在 <span className="font-mono">/inter</span> 或业务平台侧完成。
          </AlertDescription>
        </Alert>

        <datalist id="simhub-known-groups">
          {existingGroups.map(g => <option key={g} value={g} />)}
        </datalist>

        <Tabs
          value={tab}
          onValueChange={next => {
            if (next === 'prov' || next === 'manual') {
              runViewTransition(() => setTab(next), 'filter')
            }
          }}
        >
          <TabsList className="w-full" size="sm">
            <TabsTab value="prov">配网链接 / 批量导入</TabsTab>
            <TabsTab value="manual">手动绑定单号</TabsTab>
          </TabsList>

          <TabsPanel value="prov" className="grid gap-3 pt-2">
            <div className="grid gap-1.5">
              <Label htmlFor="numbers-prov-input" className="text-xs">配网 URL（支持每行一个批量导入） / XML / linphonerc / JSON</Label>
              <Textarea
                ref={inputRef}
                id="numbers-prov-input"
                rows={3}
                value={importText}
                onChange={e => { setImportText(e.target.value); setProvError('') }}
                placeholder="粘贴单条或多条 https://.../api/v1/provisioning/<token>，或配网文本"
                spellCheck={false}
                className="font-mono text-xs"
              />
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="prov-group-input" className="text-[11px] text-muted-foreground">归属号码组（可选）</Label>
                <Input
                  id="prov-group-input"
                  size="sm"
                  list="simhub-known-groups"
                  value={importGroup}
                  onChange={e => setImportGroup(e.target.value)}
                  placeholder="默认分组 / 如：客服组"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="prov-label-input" className="text-[11px] text-muted-foreground">备注前缀（可选）</Label>
                <Input
                  id="prov-label-input"
                  size="sm"
                  value={importLabel}
                  onChange={e => setImportLabel(e.target.value)}
                  placeholder="如：销售外呼"
                />
              </div>
            </div>

            <Button type="button" variant="outline" size="sm" loading={importing} onClick={() => void handleParse()}>
              <Download size={14} />解析配网内容
            </Button>

            {imported && (
              <div className="grid gap-2.5 rounded-lg border border-border bg-background/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">已识别待绑定号码</span>
                  <Badge variant="success" size="sm">{imported.accounts.length} 个</Badge>
                </div>

                <div className="grid max-h-36 gap-1.5 overflow-y-auto">
                  {imported.accounts.map(acc => {
                    const display = acc.phoneNumber || acc.username
                    return (
                      <div key={`${acc.slot}-${acc.username}`} className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-panel px-2.5 py-1.5 text-[11px]">
                        <div className="min-w-0">
                          <div className="truncate font-mono font-medium">{display}</div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {acc.phoneNumber ? `${acc.username}@${acc.domain}` : `@${acc.domain}`}{acc.label ? ` · ${acc.label}` : ''}
                          </div>
                        </div>
                        <Badge variant="outline" size="sm">{acc.ha1 ? 'HA1' : '密码'}</Badge>
                      </div>
                    )
                  })}
                </div>

                {!imported.websocketUrl && (
                  <div className="grid gap-1">
                    <Label htmlFor="prov-ws-fallback" className="text-[11px]">补充 WebSocket 服务器</Label>
                    <Input
                      id="prov-ws-fallback"
                      size="sm"
                      value={provServer}
                      onChange={e => setProvServer(e.target.value)}
                      placeholder="wss://服务器:8465/sip"
                      spellCheck={false}
                    />
                  </div>
                )}

                {imported.accounts.length > 1 && (
                  <div className="grid gap-1">
                    <Label id="prov-preview-select" className="text-[11px] text-muted-foreground">也可填入单个到“手动绑定”表单细调</Label>
                    <Select
                      items={imported.accounts.map(acc => ({
                        value: String(acc.slot),
                        label: acc.phoneNumber ? `${acc.phoneNumber} (${acc.username})` : `${acc.username}@${acc.domain}`,
                      }))}
                      value={selectedSlot}
                      onValueChange={val => {
                        const hit = imported.accounts.find(a => String(a.slot) === val)
                        if (hit) applyChoiceToManual(imported, hit)
                      }}
                    >
                      <SelectTrigger aria-labelledby="prov-preview-select" size="sm"><SelectValue /></SelectTrigger>
                      <SelectPopup>
                        {imported.accounts.map(acc => (
                          <SelectItem key={acc.slot} value={String(acc.slot)}>
                            {acc.phoneNumber ? `${acc.phoneNumber} (${acc.username})` : `${acc.username}@${acc.domain}`}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </div>
                )}

                <Button type="button" size="sm" onClick={() => void handleBatchBind()}>
                  <Plus size={14} />全部叠加绑定并上线 ({imported.accounts.length} 个)
                </Button>
              </div>
            )}

            {partialFailures.length > 0 && (
              <Alert variant="warning" className="px-3 py-2 text-[11px] leading-relaxed">
                <AlertDescription>
                  <div className="font-medium">以下链接未能解析：</div>
                  {partialFailures.map((err, i) => <div key={i}>{err}</div>)}
                </AlertDescription>
              </Alert>
            )}

            {importNotice && !provError && (
              <Alert variant="success" className="px-3 py-2 text-xs">
                <AlertDescription>{importNotice}</AlertDescription>
              </Alert>
            )}
            {provError && (
              <Alert variant="error" className="px-3 py-2 text-xs">
                <AlertDescription>{provError}</AlertDescription>
              </Alert>
            )}
          </TabsPanel>

          <TabsPanel value="manual" className="grid gap-3 pt-2">
            {editingAccount && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/8 px-2.5 py-1.5 text-[11px]">
                <span className="truncate font-medium text-primary">正在更新：{editingAccount.username}@{editingAccount.domain}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    onClearEditing?.()
                    setDraft({ ...emptyAccount, mode: 'sip', server: defaultServer, domain: defaultDomain, remember: true })
                  }}
                >
                  取消编辑
                </Button>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="num-server" className="text-xs">WebSocket 服务器</Label>
              <Input
                id="num-server"
                size="sm"
                value={draft.server}
                onChange={e => { setDraft(p => ({ ...p, server: e.target.value })); setManualError('') }}
                placeholder="wss://服务器地址:8465/sip"
                spellCheck={false}
              />
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="num-domain" className="text-xs">SIP 域名</Label>
                <Input
                  id="num-domain"
                  size="sm"
                  value={draft.domain}
                  onChange={e => { setDraft(p => ({ ...p, domain: e.target.value })); setManualError('') }}
                  placeholder="webrtc.local"
                  spellCheck={false}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="num-user" className="text-xs">SIP 用户名 / 号码</Label>
                <Input
                  id="num-user"
                  size="sm"
                  value={draft.username}
                  onChange={e => { setDraft(p => ({ ...p, username: e.target.value })); setManualError('') }}
                  placeholder="+15550000001"
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="num-group" className="text-xs flex items-center gap-1"><FolderPlus size={12} />所属号码组</Label>
                <Input
                  id="num-group"
                  size="sm"
                  list="simhub-known-groups"
                  value={draft.group ?? ''}
                  onChange={e => setDraft(p => ({ ...p, group: e.target.value }))}
                  placeholder="默认分组 / 客服组"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="num-label" className="text-xs">号码备注标签</Label>
                <Input
                  id="num-label"
                  size="sm"
                  value={draft.label ?? ''}
                  onChange={e => setDraft(p => ({ ...p, label: e.target.value }))}
                  placeholder="如：主叫线 A"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="num-password" className="text-xs">SIP 密码（或留空使用 HA1）</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  id="num-password"
                  size="sm"
                  type={showPassword ? 'text' : 'password'}
                  value={draft.password}
                  onChange={e => {
                    const val = e.target.value
                    setDraft(p => ({ ...p, password: val, ha1: val ? undefined : p.ha1 }))
                    setManualError('')
                  }}
                  placeholder={draft.ha1 ? '已载入配网 HA1（可留空）' : '输入密码'}
                  autoComplete="off"
                />
                <Button type="button" variant="ghost" size="icon-sm" aria-label={showPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowPassword(v => !v)}>
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </Button>
              </div>
              {draft.ha1 && !draft.password && (
                <div className="flex items-center justify-between gap-2 rounded-md border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
                  <span className="flex items-center gap-1"><KeyRound size={12} />已载入 HA1 凭据</span>
                  <Button type="button" variant="ghost" size="xs" onClick={() => setDraft(p => ({ ...p, ha1: undefined }))}>清除</Button>
                </div>
              )}
            </div>

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="rounded-lg border border-border/80 px-3 py-2">
              <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground">
                <span>高级标准选项（Auth ID / STUN / TURN）</span>
                <ChevronDown size={14} className={advancedOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </CollapsibleTrigger>
              <CollapsiblePanel className="grid gap-2.5 pt-2.5">
                <div className="grid gap-1">
                  <Label htmlFor="num-auth" className="text-[11px]">认证用户名 (Auth ID)</Label>
                  <Input
                    id="num-auth"
                    size="sm"
                    value={draft.authorizationUsername ?? ''}
                    onChange={e => setDraft(p => ({ ...p, authorizationUsername: e.target.value }))}
                    placeholder="默认同 SIP 用户名"
                    spellCheck={false}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="num-ice" className="text-[11px]">STUN / TURN 服务器（每行一条）</Label>
                  <Textarea
                    id="num-ice"
                    size="sm"
                    rows={2}
                    value={iceText}
                    onChange={e => setIceText(e.target.value)}
                    placeholder="stun:stun.example.invalid:3478"
                    spellCheck={false}
                    className="font-mono text-[11px]"
                  />
                </div>
              </CollapsiblePanel>
            </Collapsible>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/50 px-3 py-2">
              <Label htmlFor="num-remember" className="flex flex-col items-start gap-0.5 text-xs">
                <span>记住非敏感配置</span>
                <span className="text-[10px] font-normal text-muted-foreground">密码与 HA1 绝不写入本地存储</span>
              </Label>
              <Switch
                id="num-remember"
                checked={draft.remember ?? true}
                onCheckedChange={checked => setDraft(p => ({ ...p, remember: checked }))}
              />
            </div>

            {manualError && (
              <Alert variant="error" className="px-3 py-2 text-xs">
                <AlertDescription>{manualError}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => void handleManualSubmit(false)}>
                仅保存
              </Button>
              <Button type="button" size="sm" onClick={() => void handleManualSubmit(true)}>
                <ShieldCheck size={14} />绑定并上线
              </Button>
            </div>
          </TabsPanel>
        </Tabs>
      </CardPanel>
    </Card>
  )
}

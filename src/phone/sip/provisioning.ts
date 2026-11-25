export interface ProvisionedAccountChoice {
  slot: number
  username: string
  authorizationUsername?: string
  phoneNumber?: string
  domain: string
  realm?: string
  ha1?: string
  password?: string
  label?: string
  group?: string
}

export interface BatchResolveResult {
  result: ProvisioningImportResult
  failures: string[]
}

export function unwrapProvisioningUrl(raw: string): string {
  let value = raw.trim()
  const lower = value.toLowerCase()
  if (lower.startsWith('linphone-config://')) {
    value = value.slice('linphone-config://'.length).trim()
  } else if (lower.startsWith('linphone-config:')) {
    value = value.slice('linphone-config:'.length).trim()
  } else {
    return value
  }
  const innerLower = value.toLowerCase()
  if (
    value &&
    !innerLower.startsWith('https://') &&
    !innerLower.startsWith('http://') &&
    !value.includes('://')
  ) {
    return `https://${value}`
  }
  return value
}

export function extractProvisioningUrls(raw: string): string[] | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.startsWith('{') || trimmed.startsWith('<')) return null
  const lines = trimmed
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
  if (!lines.length) return null

  const seen = new Set<string>()
  const urls: string[] = []
  for (const line of lines) {
    const normalized = unwrapProvisioningUrl(line)
    if (!/^https?:\/\//i.test(normalized)) return null
    if (!seen.has(normalized)) {
      seen.add(normalized)
      urls.push(normalized)
    }
  }
  return urls
}

export interface ProvisioningImportResult {
  accounts: ProvisionedAccountChoice[]
  websocketUrl?: string
  registrationExpiresSeconds?: number
  sipProxy?: string
  transport?: string
  expiresAt?: string
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function deriveWebSocketUrl(hintUrl?: string): string | undefined {
  if (!hintUrl) return undefined
  try {
    const parsed = new URL(hintUrl)
    if (parsed.protocol === 'https:' && parsed.host) {
      return `wss://${parsed.host}/sip`
    }
  } catch {
    // Ignore invalid hint URL
  }
  return undefined
}

function parseIdentityUri(raw: string): { displayName?: string; username?: string; domain?: string } {
  const displayMatch = /^"([^"]+)"\s*<sip:/i.exec(raw.trim())
  const match = /sip:([^@>\s;]+)@([^>\s;]+)/i.exec(raw)
  if (!match) return { displayName: displayMatch?.[1]?.trim() || undefined }
  return {
    displayName: displayMatch?.[1]?.trim() || undefined,
    username: match[1]?.trim(),
    domain: match[2]?.trim(),
  }
}

function buildFromSections(
  sections: Record<string, Record<string, string>>,
  hintUrl?: string,
): ProvisioningImportResult {
  const authSlots = Object.keys(sections)
    .map(name => ({ name, match: /^auth_info_(\d+)$/.exec(name) }))
    .filter((item): item is { name: string; match: RegExpExecArray } => item.match !== null)
    .map(item => ({ slot: Number(item.match[1]), values: sections[item.name] }))
    .sort((a, b) => a.slot - b.slot)

  const accounts: ProvisionedAccountChoice[] = []
  let registrationExpiresSeconds: number | undefined
  let sipProxy: string | undefined

  for (const { slot, values } of authSlots) {
    const proxy = sections[`proxy_${slot}`] ?? {}
    const identity = proxy.reg_identity ? parseIdentityUri(proxy.reg_identity) : {}
    const username = (values.username || values.userid || identity.username || '').trim()
    const authUser = (values.userid || '').trim()
    const domain = (values.domain || identity.domain || values.realm || proxy.realm || '').trim()
    const realm = (values.realm || proxy.realm || '').trim()
    const ha1 = (values.ha1 || '').trim().toLowerCase()
    const password = (values.passwd || '').trim()

    if (!proxy.reg_proxy) {
      // keep looking
    } else if (!sipProxy) {
      sipProxy = proxy.reg_proxy.trim()
    }
    if (registrationExpiresSeconds === undefined && proxy.reg_expires) {
      const n = Number(proxy.reg_expires)
      if (Number.isFinite(n) && n >= 30 && n <= 86400) registrationExpiresSeconds = Math.floor(n)
    }

    if (username && domain && (ha1 || password)) {
      const displayNum = identity.displayName && identity.displayName !== username
        ? identity.displayName
        : undefined
      accounts.push({
        slot,
        username,
        ...(authUser && authUser !== username ? { authorizationUsername: authUser } : {}),
        ...(displayNum ? { phoneNumber: displayNum } : {}),
        domain,
        ...(realm ? { realm } : {}),
        ...(ha1 ? { ha1 } : {}),
        ...(password ? { password } : {}),
      })
    }
  }

  if (!accounts.length) {
    throw new Error('未在配网文本中找到有效的 SIP 账号或 HA1 凭据。')
  }

  return {
    accounts,
    websocketUrl: deriveWebSocketUrl(hintUrl),
    registrationExpiresSeconds,
    sipProxy,
  }
}

function parseLinphoneXml(raw: string, hintUrl?: string): ProvisioningImportResult {
  const sections: Record<string, Record<string, string>> = {}
  const sectionRe = /<section\b[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/section>/gi
  let sectionMatch: RegExpExecArray | null
  while ((sectionMatch = sectionRe.exec(raw)) !== null) {
    const sectionName = decodeXmlEntities(sectionMatch[1]).trim()
    const body = sectionMatch[2]
    const entries: Record<string, string> = {}
    const entryRe = /<entry\b[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/entry>/gi
    let entryMatch: RegExpExecArray | null
    while ((entryMatch = entryRe.exec(body)) !== null) {
      const key = decodeXmlEntities(entryMatch[1]).trim()
      const value = decodeXmlEntities(entryMatch[2]).trim()
      entries[key] = value
    }
    sections[sectionName] = entries
  }
  return buildFromSections(sections, hintUrl)
}

function parseLinphoneIni(raw: string, hintUrl?: string): ProvisioningImportResult {
  const sections: Record<string, Record<string, string>> = {}
  let current = ''
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue
    const secMatch = /^\[([^\]]+)\]$/.exec(line)
    if (secMatch) {
      current = secMatch[1].trim()
      if (!sections[current]) sections[current] = {}
      continue
    }
    if (!current) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const k = line.slice(0, eq).trim()
    const v = line.slice(eq + 1).trim()
    sections[current][k] = v
  }
  return buildFromSections(sections, hintUrl)
}

function parseProvisioningJson(obj: Record<string, unknown>, hintUrl?: string): ProvisioningImportResult {
  const websocketUrl = typeof obj.websocket_url === 'string' && obj.websocket_url.trim()
    ? obj.websocket_url.trim()
    : typeof obj.sip_websocket_url === 'string' && obj.sip_websocket_url.trim()
      ? obj.sip_websocket_url.trim()
      : deriveWebSocketUrl(hintUrl)
  const registrationExpiresSeconds = typeof obj.registration_expires_seconds === 'number' &&
    Number.isFinite(obj.registration_expires_seconds)
    ? Math.floor(obj.registration_expires_seconds)
    : undefined
  const sipProxy = typeof obj.sip_proxy === 'string' && obj.sip_proxy.trim() ? obj.sip_proxy.trim() : undefined
  const transport = typeof obj.transport === 'string' && obj.transport.trim() ? obj.transport.trim() : undefined
  const expiresAt = typeof obj.expires_at === 'string' && obj.expires_at.trim() ? obj.expires_at.trim() : undefined

  if (Array.isArray(obj.accounts)) {
    const accounts: ProvisionedAccountChoice[] = []
    for (const [index, entry] of obj.accounts.entries()) {
      if (!entry || typeof entry !== 'object') continue
      const item = entry as Record<string, unknown>
      const username = typeof item.sip_username === 'string'
        ? item.sip_username.trim()
        : typeof item.username === 'string'
          ? item.username.trim()
          : ''
      const authorizationUsername = typeof item.authorization_username === 'string' ? item.authorization_username.trim() : ''
      const phoneNumber = typeof item.number === 'string' && item.number.trim()
        ? item.number.trim()
        : typeof item.phone_number === 'string' && item.phone_number.trim()
          ? item.phone_number.trim()
          : ''
      const domain = typeof item.domain === 'string' && item.domain.trim()
        ? item.domain.trim()
        : typeof obj.domain === 'string'
          ? obj.domain.trim()
          : ''
      const realm = typeof item.realm === 'string' && item.realm.trim()
        ? item.realm.trim()
        : typeof obj.realm === 'string'
          ? obj.realm.trim()
          : ''
      const ha1 = typeof item.ha1 === 'string' ? item.ha1.trim().toLowerCase() : ''
      const password = typeof item.sip_password === 'string'
        ? item.sip_password.trim()
        : typeof item.password === 'string'
          ? item.password.trim()
          : ''
      const label = typeof item.label === 'string' && item.label.trim() ? item.label.trim() : ''
      const group = typeof item.group === 'string' && item.group.trim()
        ? item.group.trim()
        : typeof obj.group === 'string' && obj.group.trim()
          ? obj.group.trim()
          : ''
      if (username && domain && (ha1 || password)) {
        accounts.push({
          slot: typeof item.slot === 'number' ? item.slot : index,
          username,
          ...(authorizationUsername && authorizationUsername !== username ? { authorizationUsername } : {}),
          ...(phoneNumber ? { phoneNumber } : {}),
          domain,
          ...(realm ? { realm } : {}),
          ...(ha1 ? { ha1 } : {}),
          ...(password ? { password } : {}),
          ...(label ? { label } : {}),
          ...(group ? { group } : {}),
        })
      }
    }
    if (accounts.length) {
      return { accounts, websocketUrl, registrationExpiresSeconds, sipProxy, transport, expiresAt }
    }
  }

  const singleUsername = typeof obj.sip_username === 'string'
    ? obj.sip_username.trim()
    : typeof obj.username === 'string'
      ? obj.username.trim()
      : ''
  const singleAuthUser = typeof obj.authorization_username === 'string' ? obj.authorization_username.trim() : ''
  const singlePhoneNumber = typeof obj.number === 'string' && obj.number.trim()
    ? obj.number.trim()
    : typeof obj.phone_number === 'string' && obj.phone_number.trim()
      ? obj.phone_number.trim()
      : ''
  const singleDomain = typeof obj.domain === 'string' ? obj.domain.trim() : ''
  const singleRealm = typeof obj.realm === 'string' ? obj.realm.trim() : ''
  const singleHa1 = typeof obj.ha1 === 'string' ? obj.ha1.trim().toLowerCase() : ''
  const singlePassword = typeof obj.sip_password === 'string'
    ? obj.sip_password.trim()
    : typeof obj.password === 'string'
      ? obj.password.trim()
      : ''

  const singleLabel = typeof obj.label === 'string' && obj.label.trim() ? obj.label.trim() : ''
  const singleGroup = typeof obj.group === 'string' && obj.group.trim() ? obj.group.trim() : ''

  if (singleUsername && singleDomain && (singleHa1 || singlePassword)) {
    return {
      accounts: [{
        slot: 0,
        username: singleUsername,
        ...(singleAuthUser && singleAuthUser !== singleUsername ? { authorizationUsername: singleAuthUser } : {}),
        ...(singlePhoneNumber ? { phoneNumber: singlePhoneNumber } : {}),
        domain: singleDomain,
        ...(singleRealm ? { realm: singleRealm } : {}),
        ...(singleHa1 ? { ha1: singleHa1 } : {}),
        ...(singlePassword ? { password: singlePassword } : {}),
        ...(singleLabel ? { label: singleLabel } : {}),
        ...(singleGroup ? { group: singleGroup } : {}),
      }],
      websocketUrl,
      registrationExpiresSeconds,
      sipProxy,
      transport,
      expiresAt,
    }
  }

  if (typeof obj.xml === 'string' && obj.xml.trim()) {
    const parsed = parseLinphoneXml(obj.xml, hintUrl)
    return {
      ...parsed,
      websocketUrl: websocketUrl ?? parsed.websocketUrl,
      registrationExpiresSeconds: registrationExpiresSeconds ?? parsed.registrationExpiresSeconds,
      sipProxy: sipProxy ?? parsed.sipProxy,
      transport,
      expiresAt,
    }
  }

  if (typeof obj.linphonerc === 'string' && obj.linphonerc.trim()) {
    const parsed = parseLinphoneIni(obj.linphonerc, hintUrl)
    return {
      ...parsed,
      websocketUrl: websocketUrl ?? parsed.websocketUrl,
      registrationExpiresSeconds: registrationExpiresSeconds ?? parsed.registrationExpiresSeconds,
      sipProxy: sipProxy ?? parsed.sipProxy,
      transport,
      expiresAt,
    }
  }

  throw new Error('JSON 配网响应中缺少有效的 SIP 账号、HA1 或密码信息。')
}

export function parseProvisioningPayload(raw: string, hintUrl?: string): ProvisioningImportResult {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('请先输入配网链接，或粘贴 XML / linphonerc / JSON 配网内容。')

  if (trimmed.startsWith('{')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      throw new Error('配网 JSON 格式无效，请检查内容是否完整。')
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('配网 JSON 必须是对象结构。')
    }
    return parseProvisioningJson(parsed as Record<string, unknown>, hintUrl)
  }

  if (trimmed.startsWith('<')) {
    return parseLinphoneXml(trimmed, hintUrl)
  }

  if (/^\[[^\]]+\]/m.test(trimmed)) {
    return parseLinphoneIni(trimmed, hintUrl)
  }

  throw new Error('无法识别的配网内容格式，支持 /api/v1/provisioning 链接、XML、linphonerc 文本或 JSON。')
}

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export async function fetchProvisioningUrl(
  rawUrl: string,
  fetcher: Fetcher = (input, init) => fetch(input, init),
): Promise<ProvisioningImportResult> {
  const trimmed = unwrapProvisioningUrl(rawUrl)
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error('请输入有效的 HTTP(S) 配网链接。')
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.host) {
    throw new Error('配网链接须使用 http:// 或 https:// 协议。')
  }
  if (!url.searchParams.has('format')) {
    url.searchParams.set('format', 'json')
  }

  let response: Response
  try {
    response = await fetcher(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json, application/xml, text/plain' },
      cache: 'no-store',
    })
  } catch {
    throw new Error('无法拉取配网链接（可能是自签证书未信任或跨域限制）；可直接在浏览器打开该链接后复制 XML / linphonerc 粘贴导入。')
  }

  if (!response.ok) {
    if (response.status === 410) throw new Error('配网链接已过期，请重新生成。')
    if (response.status === 404) throw new Error('配网链接无效或已被撤销。')
    if (response.status === 403) throw new Error('访问配网链接被拒绝（需 HTTPS，或请先检查网关 allowed_origins / 授权状态）。')
    throw new Error(`拉取配网失败（HTTP ${response.status}）。`)
  }

  const body = await response.text()
  return parseProvisioningPayload(body, url.toString())
}

export async function resolveProvisioningInput(
  raw: string,
  fetcher: Fetcher = (input, init) => fetch(input, init),
): Promise<BatchResolveResult> {
  const batchUrls = extractProvisioningUrls(raw)
  if (!batchUrls) {
    return {
      result: parseProvisioningPayload(raw),
      failures: [],
    }
  }
  if (batchUrls.length === 1) {
    return {
      result: await fetchProvisioningUrl(batchUrls[0], fetcher),
      failures: [],
    }
  }

  const byKey = new Map<string, ProvisionedAccountChoice>()
  const failures: string[] = []
  let websocketUrl: string | undefined
  let registrationExpiresSeconds: number | undefined
  let sipProxy: string | undefined
  let transport: string | undefined
  let expiresAt: string | undefined

  for (let i = 0; i < batchUrls.length; i++) {
    const u = batchUrls[i]
    try {
      const res = await fetchProvisioningUrl(u, fetcher)
      websocketUrl ??= res.websocketUrl
      registrationExpiresSeconds ??= res.registrationExpiresSeconds
      sipProxy ??= res.sipProxy
      transport ??= res.transport
      expiresAt ??= res.expiresAt
      for (const acc of res.accounts) {
        const key = `${acc.username.trim()}@${acc.domain.trim().toLowerCase()}`
        byKey.set(key, { ...acc, slot: byKey.has(key) ? acc.slot : byKey.size })
      }
    } catch (cause) {
      const host = (() => {
        try {
          return new URL(u).host
        } catch {
          return `第 ${i + 1} 条`
        }
      })()
      const msg = cause instanceof Error ? cause.message : '拉取失败'
      failures.push(`${host} (#${i + 1})：${msg}`)
    }
  }

  const accounts = [...byKey.values()].map((acc, idx) => ({ ...acc, slot: idx }))
  if (!accounts.length) {
    throw new Error(failures.join('\n') || '所有配网链接均未能成功导入。')
  }

  return {
    result: {
      accounts,
      websocketUrl,
      registrationExpiresSeconds,
      sipProxy,
      transport,
      expiresAt,
    },
    failures,
  }
}

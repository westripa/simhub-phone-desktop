import { accountKey, emptyAccount, normalizeAccountGroup, validateAccount, type Account } from './types'

const key = 'simhub.phone.profile.v1'
const v2Key = 'simhub.phone.accounts.v2'
type ProfileStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface SavedAccounts {
  accounts: Account[]
  activeKey: string
}

function sanitizeIceServers(raw: unknown): RTCIceServer[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: RTCIceServer[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const urlsRaw = (entry as { urls?: unknown }).urls
    const list = (Array.isArray(urlsRaw) ? urlsRaw : typeof urlsRaw === 'string' ? [urlsRaw] : [])
      .filter((u): u is string => typeof u === 'string' && /^(stuns?|turns?):/i.test(u.trim()))
      .map(u => u.trim())
    if (list.length) out.push({ urls: list.length === 1 ? list[0] : list })
  }
  return out.length ? out : undefined
}

function parseStoredAccount(raw: unknown): Account | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (value.mode === 'gateway' || value.mode === 'demo') return null
  if (![value.server, value.domain, value.username].every(item => typeof item === 'string')) {
    return null
  }
  const iceServers = sanitizeIceServers(value.iceServers)
  const profile: Account = {
    mode: 'sip',
    server: (value.server as string).trim(),
    domain: (value.domain as string).trim(),
    username: (value.username as string).trim(),
    ...(typeof value.phoneNumber === 'string' && value.phoneNumber.trim() ? { phoneNumber: value.phoneNumber.trim() } : {}),
    password: '',
    remember: true,
    ...(typeof value.label === 'string' && value.label.trim() ? { label: value.label.trim() } : {}),
    ...(typeof value.group === 'string' && value.group.trim() ? { group: normalizeAccountGroup(value.group) } : {}),
    ...(typeof value.authorizationUsername === 'string' && value.authorizationUsername ? { authorizationUsername: value.authorizationUsername } : {}),
    ...(typeof value.realm === 'string' && value.realm ? { realm: value.realm } : {}),
    ...(typeof value.registrationExpiresSeconds === 'number' ? { registrationExpiresSeconds: value.registrationExpiresSeconds } : {}),
    ...(iceServers ? { iceServers } : {}),
  }
  try {
    validateAccount(profile, false)
    return profile
  } catch {
    return null
  }
}

function serializeAccount(profile: Account): Record<string, unknown> {
  validateAccount(profile, false)
  const iceServers = sanitizeIceServers(profile.iceServers)
  // Explicit allow-list: never persist password, HA1, or TURN credentials.
  return {
    version: 1,
    mode: 'sip',
    server: profile.server,
    domain: profile.domain,
    username: profile.username,
    ...(profile.phoneNumber?.trim() ? { phoneNumber: profile.phoneNumber.trim() } : {}),
    ...(profile.label?.trim() ? { label: profile.label.trim() } : {}),
    ...(profile.group?.trim() ? { group: normalizeAccountGroup(profile.group) } : {}),
    ...(profile.authorizationUsername ? { authorizationUsername: profile.authorizationUsername } : {}),
    ...(profile.realm ? { realm: profile.realm } : {}),
    ...(profile.registrationExpiresSeconds ? { registrationExpiresSeconds: profile.registrationExpiresSeconds } : {}),
    ...(iceServers ? { iceServers } : {}),
  }
}

export function upsertAccountList(existing: Account[], incoming: Account[]): Account[] {
  const out = [...existing]
  const indexByKey = new Map<string, number>()
  out.forEach((acc, idx) => indexByKey.set(accountKey(acc), idx))
  for (const acc of incoming) {
    const k = accountKey(acc)
    const idx = indexByKey.get(k)
    if (idx === undefined) {
      indexByKey.set(k, out.length)
      out.push(acc)
    } else {
      out[idx] = {
        ...out[idx],
        ...acc,
        phoneNumber: acc.phoneNumber !== undefined ? (acc.phoneNumber.trim() || undefined) : out[idx].phoneNumber,
        label: acc.label !== undefined ? (acc.label.trim() || undefined) : out[idx].label,
        group: acc.group !== undefined ? (acc.group.trim() ? normalizeAccountGroup(acc.group) : undefined) : out[idx].group,
      }
    }
  }
  return out
}

export function loadProfile(storage?: ProfileStorage): Account {
  try {
    const value = JSON.parse((storage ?? globalThis.localStorage).getItem(key) ?? 'null')
    if (!value || value.version !== 1) return { ...emptyAccount }
    return parseStoredAccount(value) ?? { ...emptyAccount }
  } catch {
    return { ...emptyAccount }
  }
}

export function saveProfile(profile: Account, storage?: ProfileStorage): boolean {
  if (profile.mode === 'demo') return true
  try {
    const target = storage ?? globalThis.localStorage
    if (profile.remember) {
      target.setItem(key, JSON.stringify(serializeAccount(profile)))
    } else {
      target.removeItem(key)
    }
    return true
  } catch {
    return false
  }
}

export function loadAccounts(storage?: ProfileStorage): SavedAccounts {
  try {
    const target = storage ?? globalThis.localStorage
    const raw = JSON.parse(target.getItem(v2Key) ?? 'null') as {
      version?: unknown
      activeKey?: unknown
      accounts?: unknown
    } | null
    if (raw && raw.version === 2 && Array.isArray(raw.accounts)) {
      const parsed: Account[] = []
      for (const item of raw.accounts) {
        const acc = parseStoredAccount(item)
        if (acc) parsed.push(acc)
      }
      const deduped = upsertAccountList([], parsed)
      if (deduped.length) {
        const wanted = typeof raw.activeKey === 'string' ? raw.activeKey : ''
        const hasWanted = deduped.some(a => accountKey(a) === wanted)
        return {
          accounts: deduped,
          activeKey: hasWanted ? wanted : accountKey(deduped[0]),
        }
      }
      return { accounts: [], activeKey: '' }
    }
    const legacy = loadProfile(target)
    if (legacy.mode === 'sip') {
      return { accounts: [legacy], activeKey: accountKey(legacy) }
    }
    return { accounts: [], activeKey: '' }
  } catch {
    return { accounts: [], activeKey: '' }
  }
}

export function saveAccounts(accounts: Account[], activeKey: string, storage?: ProfileStorage): boolean {
  try {
    const target = storage ?? globalThis.localStorage
    const serialized: Record<string, unknown>[] = []
    const rememberedKeys = new Set<string>()
    for (const acc of upsertAccountList([], accounts)) {
      if (acc.mode !== 'sip' || !acc.remember) continue
      serialized.push(serializeAccount(acc))
      rememberedKeys.add(accountKey(acc))
    }
    if (!serialized.length) {
      target.removeItem(v2Key)
      target.removeItem(key)
      return true
    }
    const resolvedActive = rememberedKeys.has(activeKey)
      ? activeKey
      : accountKey(accounts.find(a => rememberedKeys.has(accountKey(a)))!)
    target.setItem(v2Key, JSON.stringify({
      version: 2,
      activeKey: resolvedActive,
      accounts: serialized,
    }))
    target.removeItem(key)
    return true
  } catch {
    return false
  }
}

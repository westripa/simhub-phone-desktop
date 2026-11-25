export type Connection = 'offline' | 'connecting' | 'registered' | 'error'
export type Phase = 'dialing' | 'ringing' | 'incoming' | 'answering' | 'connected' | 'ending'
export type Outcome = 'completed' | 'cancelled' | 'rejected' | 'missed' | 'failed' | 'unknown'

export const DEFAULT_ACCOUNT_GROUP = '默认分组'

export interface Account {
  mode: 'demo' | 'sip'
  server: string
  domain: string
  username: string
  phoneNumber?: string
  password: string
  label?: string
  group?: string
  ha1?: string
  realm?: string
  authorizationUsername?: string
  registrationExpiresSeconds?: number
  iceServers?: RTCIceServer[]
  remember?: boolean
}

export function accountDisplayNumber(account: Pick<Account, 'username' | 'phoneNumber'>): string {
  const num = account.phoneNumber?.trim()
  return num ? num : account.username
}

export function normalizeAccountGroup(group?: string): string {
  const trimmed = group?.trim()
  return trimmed ? trimmed : DEFAULT_ACCOUNT_GROUP
}

export function accountKey(account: Pick<Account, 'mode' | 'username' | 'domain'>): string {
  if (account.mode === 'demo') return 'demo'
  return `${account.username.trim()}@${account.domain.trim().toLowerCase()}`
}

export const emptyAccount: Account = { mode: 'demo', server: '', domain: '', username: '', password: '' }

export function hasAccountCredential(account: Account): boolean {
  return account.mode === 'demo' || Boolean(account.password || account.ha1)
}

export interface Call {
  id: string
  peer: string
  direction: 'outgoing' | 'incoming'
  phase: Phase
  started: number
  answered?: number
  sipCallId?: string
  gatewayCallId?: string
  lineId?: string
  ownNumber?: string
  accountKey?: string
  held?: boolean
  transferSource?: string
  transferReason?: string
}

export interface History extends Call {
  ended: number
  outcome: Outcome
  reasonText?: string
}

export interface PhoneState {
  connection: Connection
  call: Call | null
  history: History[]
  muted: boolean
  held: boolean
  message: string
}

export type Event =
  | { type: 'connection'; status: Connection; message?: string }
  | { type: 'call'; call: Call }
  | { type: 'end'; id: string; outcome: Outcome; at: number; reasonText?: string }
  | { type: 'message'; message: string }
  | { type: 'mute'; muted: boolean }
  | { type: 'hold'; held: boolean }
  | { type: 'clear-history' }

export interface Transport {
  connect(account: Account): Promise<void>
  disconnect(): Promise<void>
  dial(number: string, meta?: { lineId?: string; ownNumber?: string }): Promise<void>
  answer(): Promise<void>
  hangup(): Promise<void>
  mute(muted: boolean): void
  sendDtmf?(digit: string): Promise<void>
  setHold?(held: boolean): Promise<void>
  incoming?(meta?: { lineId?: string; ownNumber?: string }): void
}

export type Emit = (event: Event) => void

export const initialState: PhoneState = { connection: 'offline', call: null, history: [], muted: false, held: false, message: '' }

export function reducePhone(state: PhoneState, event: Event): PhoneState {
  switch (event.type) {
    case 'connection': return { ...state, connection: event.status, message: event.message ?? '' }
    case 'message': return { ...state, message: event.message }
    case 'mute': return { ...state, muted: event.muted }
    case 'hold': return {
      ...state,
      held: event.held,
      call: state.call ? { ...state.call, held: event.held } : null,
    }
    case 'call': {
      const prev = state.call && state.call.id === event.call.id ? state.call : null
      const connected = event.call.phase === 'connected'
      const merged: Call = {
        ...event.call,
        lineId: event.call.lineId ?? prev?.lineId,
        ownNumber: event.call.ownNumber ?? prev?.ownNumber,
        sipCallId: event.call.sipCallId ?? prev?.sipCallId,
        gatewayCallId: event.call.gatewayCallId ?? prev?.gatewayCallId,
        accountKey: event.call.accountKey ?? prev?.accountKey,
        held: connected ? (event.call.held ?? prev?.held ?? state.held) : false,
        transferSource: event.call.transferSource ?? prev?.transferSource,
        transferReason: event.call.transferReason ?? prev?.transferReason,
      }
      return {
        ...state,
        call: merged,
        muted: connected ? state.muted : false,
        held: connected ? state.held : false,
        message: '',
      }
    }
    case 'end': {
      if (!state.call || state.call.id !== event.id) return state
      const item: History = {
        ...state.call,
        ended: event.at,
        outcome: event.outcome,
        ...(event.reasonText ? { reasonText: event.reasonText } : {}),
      }
      return { ...state, call: null, muted: false, held: false, history: [item, ...state.history].slice(0, 50) }
    }
    case 'clear-history': return { ...state, history: [] }
  }
}

export function normalizeNumber(value: string): string {
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error('请只输入一个号码，不要粘贴多行内容。')
  const number = value.trim().replace(/[\s()\-]/g, '')
  if (!/^\+?[0-9]{1,15}$/.test(number)) throw new Error('请输入 1–15 位数字，国际号码可在开头加 +。')
  return number
}

const sipUserPattern = /^\+?[a-zA-Z0-9._-]{1,64}$/
const ha1Pattern = /^[a-fA-F0-9]{32}$/

export function validateAccount(account: Account, requireCredential = true): void {
  if (account.mode === 'demo') return
  let url: URL
  try { url = new URL(account.server) } catch { throw new Error('请输入有效的 WebSocket 服务器地址。') }
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('服务器须使用 WSS 地址，且不包含密码或查询参数。')
  }
  if (url.protocol === 'ws:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('明文 WS 仅用于本机回环测试，其他地址请使用 WSS。')
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*(?::[0-9]{1,5})?$/.test(account.domain)) {
    throw new Error('请输入 SIP 域名，不要添加 sip: 或路径。')
  }
  if (!sipUserPattern.test(account.username)) {
    throw new Error('SIP 用户名须为 1–64 位字母、数字、.、_、-，号码可在开头加 +。')
  }
  if (account.authorizationUsername && !sipUserPattern.test(account.authorizationUsername)) {
    throw new Error('SIP 认证用户名格式无效。')
  }
  if (account.ha1 && !ha1Pattern.test(account.ha1)) {
    throw new Error('HA1 凭据须为 32 位十六进制 MD5 摘要。')
  }
  if (account.registrationExpiresSeconds !== undefined && (!Number.isFinite(account.registrationExpiresSeconds) || account.registrationExpiresSeconds < 30 || account.registrationExpiresSeconds > 86400)) {
    throw new Error('注册有效期须在 30 至 86400 秒之间。')
  }
  if (account.iceServers?.length) {
    for (const server of account.iceServers) {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
      if (!urls.length || urls.some(item => typeof item !== 'string' || !/^(stuns?|turns?):/i.test(item.trim()))) {
        throw new Error('ICE 服务器须使用 stun: / stuns: / turn: / turns: 地址。')
      }
    }
  }
  if (requireCredential && !account.password && !account.ha1) {
    throw new Error('请输入 SIP 密码，或导入包含 HA1 的标准配网配置。')
  }
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`
}

export function mediaFailure(error: unknown): string {
  if (error instanceof Error) {
    if (['NotAllowedError', 'SecurityError'].includes(error.name)) return '未获得麦克风权限，请允许访问后重新操作。'
    if (error.name === 'NotFoundError') return '没有找到可用的麦克风，请连接设备。'
    if (['NotReadableError', 'OverconstrainedError'].includes(error.name)) return '所选麦克风不可用或被占用，请检查音频设备。'
  }
  return '操作未完成，请检查连接和音频设备；不会自动重拨。'
}

import { Invitation, Inviter, Registerer, RegistererState, SessionState, UserAgent, Web, type Session } from 'sip.js'
import { accountDisplayNumber, accountKey, mediaFailure, type Account, type Call, type Emit, type Outcome, type Transport } from '../types'

const statusMessage = (code: number = 0) => ({
  400: '呼叫参数无效，请核对号码格式。',
  401: '账号认证失败，请检查分机和密码。',
  402: '余额不足，无法拨打。',
  403: '账号或拨号权限被拒绝。',
  404: '未找到分机或目标。',
  407: '账号认证失败（407），请重新导入配网。',
  408: '请求超时，结果未知，请确认后再操作。',
  480: '对方暂时无法接听。',
  484: '号码位数不完整，请核对后再拨。',
  486: '线路或对方正忙。',
  487: '呼叫被远端中止。',
  488: '双方没有可用的音频编码。',
  500: '网关或服务器内部错误，请稍后再试。',
  502: '网关上游异常，请稍后再试。',
  503: '服务暂时不可用。',
  504: '呼叫响应超时，请确认后再操作。',
  603: '对方拒绝了通话。',
}[code] ?? `请求未成功（${code}），不会自动重拨。`)

const reasonTokenPattern = /^\s*SIP\s*;\s*cause\s*=\s*\d{3}\s*(?:;[^;]*)?;\s*text\s*=\s*"([A-Z0-9_]+)"\s*$/i
const q850CausePattern = /Q\.850\s*;\s*cause\s*=\s*(\d+)/i
const upstreamSipPattern = /^UPSTREAM_SIP_(\d{3})$/

function extractReasonToken(reasons: readonly string[]): string | undefined {
  for (const reason of reasons) {
    const token = reasonTokenPattern.exec(reason)?.[1]
    if (token) return token.toUpperCase()
  }
  return undefined
}

function extractQ850Cause(reasons: readonly string[]): number | undefined {
  for (const reason of reasons) {
    const m = q850CausePattern.exec(reason)
    if (m) return Number(m[1])
  }
  return undefined
}

function isCompletedElsewhere(reasons: readonly string[]): boolean {
  return reasons.some(r => /call completed elsewhere/i.test(r))
}

function midCallByeFailureMessage(reasons: readonly string[]): string | null {
  const token = extractReasonToken(reasons)
  if (token) {
    if (upstreamSipPattern.test(token)) {
      return '上游网络中断，通话已结束。'
    }
    switch (token) {
      case 'ENGINE_MEDIA_FAILED':
      case 'ENGINE_NO_AUDIO':
        return '通话媒体异常中断，已自动结束。'
      case 'ENGINE_MEDIA_TIMEOUT':
        return '通话媒体超时中断，已自动结束。'
      case 'ENGINE_CALL_POLICY_ENDED':
        return '通话因线路策略限制或时长上限已结束。'
      case 'ENGINE_EPOCH_CHANGED':
        return '网关状态已变更，当前通话已中断。'
      case 'ENGINE_CALL_FAILED':
      case 'ENGINE_STATE_UNCERTAIN':
      case 'ENGINE_UNREACHABLE':
      case 'ENGINE_RESULT_UNKNOWN':
      case 'ENGINE_CALL_DISAPPEARED':
      case 'ENGINE_HANGUP_UNCONFIRMED':
      case 'UPSTREAM_CALL_FAILED':
        return '线路状态异常，通话已中断，请确认线路状态。'
    }
  }
  switch (extractQ850Cause(reasons)) {
    case 41:
      return '通话媒体异常中断，已自动结束。'
    case 102:
      return '通话媒体超时中断，已自动结束。'
    case 47:
      return '通话因线路策略限制或资源不可用已结束。'
    case 38:
      return '网关或线路连接异常，通话已中断。'
    default:
      return null
  }
}

function classifyCallFailure(
  code: number | undefined,
  reasons: readonly string[],
  context?: { peer?: string; wasRinging?: boolean },
): { outcome: Outcome; message: string } {
  const token = extractReasonToken(reasons)
  if (token) {
    switch (token) {
      case 'CARRIER_CREDIT_LIMIT': return { outcome: 'failed', message: '余额不足，无法拨打。' }
      case 'CARRIER_SERVICE_DENIED': return { outcome: 'failed', message: '运营商拒绝提供本次通话服务。' }
      case 'CARRIER_USER_UNKNOWN': return { outcome: 'failed', message: '拨打的号码不存在。' }
      case 'CARRIER_BUSY': return { outcome: 'rejected', message: '对方正在通话中或忙线。' }
      case 'CARRIER_CALL_REJECTED': return { outcome: 'rejected', message: '对方拒绝了通话。' }
      case 'CARRIER_NO_ANSWER': return { outcome: 'failed', message: '对方无人接听或暂时无法接通。' }
      case 'CARRIER_AUTH_REJECTED': return { outcome: 'failed', message: '当前线路被运营商限制呼出。' }
      case 'TEST_ROUTE_DISABLED': return { outcome: 'failed', message: '该测试短号未启用（可用 9196 / 9197 / 9201–9209）。' }
      case 'TEST_ENGINE_UNAVAILABLE': return { outcome: 'failed', message: '测试语音引擎未连接，请稍后再试。' }
      case 'TEST_ENGINE_ERROR': return { outcome: 'failed', message: '测试语音服务暂未就绪（若拨 9209 请先配置 AI Key）。' }
      case 'ENGINE_IMS_NOT_READY': return { outcome: 'failed', message: '当前号码线路尚未就绪（IMS 未注册）。' }
      case 'ENGINE_LINE_BUSY':
      case 'CALL_IN_PROGRESS': return { outcome: 'failed', message: '当前号码线路正在通话中，请稍后再试。' }
      case 'ENGINE_LINE_NOT_FOUND':
      case 'OUTBOUND_NOT_BOUND': return { outcome: 'failed', message: '当前账号未绑定可用的外呼线路。' }
      case 'LINE_SUSPENDED': return { outcome: 'failed', message: '当前号码线路已停用或暂停服务，请联系管理员。' }
      case 'LINE_UNAVAILABLE': return { outcome: 'failed', message: '当前号码线路暂不可用，请稍后再试。' }
      case 'ENGINE_DIAL_TIMEOUT': return { outcome: 'failed', message: '呼叫响应超时，结果未知，请确认后再操作。' }
      case 'ENGINE_MEDIA_FAILED':
      case 'ENGINE_MEDIA_TIMEOUT':
      case 'ENGINE_NO_AUDIO': return { outcome: 'failed', message: '通话媒体异常中断，已自动结束。' }
      case 'ENGINE_MEDIA_NOT_READY':
      case 'ENGINE_MEDIA_CONFLICT': return { outcome: 'failed', message: '线路媒体通道未就绪或已被占用，请稍后再试。' }
      case 'ENGINE_EPOCH_CHANGED': return { outcome: 'failed', message: '网关状态已变更，请重新发起呼叫。' }
      case 'ENGINE_CALL_POLICY_ENDED': return { outcome: 'failed', message: '通话被网关线路策略终止。' }
      case 'ENGINE_RESULT_UNKNOWN':
      case 'ENGINE_STATE_UNCERTAIN':
      case 'ENGINE_CALL_DISAPPEARED':
      case 'ENGINE_HANGUP_UNCONFIRMED': return { outcome: 'failed', message: '网关未确认此次操作结果，不会自动重拨，请核对线路状态。' }
      case 'ENGINE_UNREACHABLE':
      case 'ENGINE_CALL_FAILED': return { outcome: 'failed', message: '网关或卡池引擎异常，请稍后核对线路状态。' }
      case 'ENGINE_BAD_REQUEST': return { outcome: 'failed', message: '请求参数无效，请核对号码格式。' }
      case 'UPSTREAM_SIP_487': return { outcome: 'failed', message: '上游网络终止了本次呼叫（SIP 487）。' }
      case 'UPSTREAM_CALL_FAILED': return { outcome: 'failed', message: '上游运营商未能建立本次通话，请稍后再试。' }
      case 'CODEC_MISMATCH': return { outcome: 'failed', message: '双方没有可用的音频编码。' }
      case 'FORBIDDEN':
      case 'MISSING_GATEWAY_ACCOUNT':
      case 'ENGINE_UNAUTHORIZED': return { outcome: 'failed', message: '账号或拨号权限被拒绝。' }
    }
    if (token.startsWith('ENGINE_REJECTED_')) {
      return { outcome: 'failed', message: `卡池引擎拒绝了本次呼叫（${token}）。` }
    }
    const upstreamMatch = upstreamSipPattern.exec(token)
    if (upstreamMatch) {
      const upstreamCode = Number(upstreamMatch[1])
      return {
        outcome: upstreamCode === 486 || upstreamCode === 603 ? 'rejected' : 'failed',
        message: statusMessage(upstreamCode),
      }
    }
  }

  const q850 = extractQ850Cause(reasons)
  if (q850 !== undefined && (code === undefined || code >= 500 || code === 480 || code === 404)) {
    switch (q850) {
      case 1: return { outcome: 'failed', message: '拨打的号码不存在（Q.850 #1）。' }
      case 17: return { outcome: 'rejected', message: '对方正在通话中或忙线。' }
      case 19: return { outcome: 'failed', message: '对方无人接听，已自动挂断。' }
      case 20: return { outcome: 'failed', message: '对方暂时无法接听（关机或不在服务区）。' }
      case 21: return { outcome: 'rejected', message: '对方或运营商拒绝了本次通话。' }
    }
  }

  if (code === 408 && context?.wasRinging) {
    return { outcome: 'failed', message: '对方无人接听，已自动挂断。' }
  }
  if (code === 403 && context?.peer && /^\d{2,5}$/.test(context.peer)) {
    return { outcome: 'failed', message: '该短号未启用或无拨号权限。' }
  }
  return {
    outcome: code === 486 || code === 603 ? 'rejected' : 'failed',
    message: statusMessage(code),
  }
}

function callFailureMessage(
  code: number | undefined,
  reasons: readonly string[],
  context?: { peer?: string; wasRinging?: boolean },
): string {
  return classifyCallFailure(code, reasons, context).message
}

// Only messages created by this adapter may reach the UI. SDK errors can
// contain full SIP addresses or transport request details.
class ClientFailure extends Error {}

export class SipPhone implements Transport {
  private ua?: UserAgent
  private session?: Session
  private call?: Call
  private account?: Account
  private closing = false
  private localEnd?: Outcome
  private registrationCancel?: () => void
  private endTimer?: ReturnType<typeof setTimeout>
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private reconnectAttempts = 0
  private reconnecting = false
  private sipGeneration = 0
  private muted = false
  private held = false
  private holdBusy = false
  constructor(
    private emit: Emit,
    private audio: HTMLAudioElement,
    private inputDevice: () => string,
    private isBusy: () => boolean = () => false,
  ) {}

  private clearReconnectTimer() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
  }

  private scheduleReconnect(message: string) {
    if (this.closing || this.reconnecting || this.call) {
      if (!this.call) this.emit({ type: 'connection', status: 'error', message })
      return
    }
    if (this.reconnectAttempts >= 3) {
      this.emit({ type: 'connection', status: 'error', message: '自动重连失败，请手动重新连接。' })
      return
    }
    this.reconnectAttempts += 1
    const delay = 1000 * 2 ** (this.reconnectAttempts - 1)
    this.emit({ type: 'connection', status: 'connecting', message })
    this.clearReconnectTimer()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      void this.restart()
    }, delay)
  }

  private async restart() {
    const account = this.account
    if (!account || this.closing) return
    this.reconnecting = true
    await this.ua?.stop().catch(() => {})
    this.ua = undefined
    this.reconnecting = false
    this.closing = false
    await this.connect(account, true)
  }

  async connect(account: Account, retry = false) {
    const gen = ++this.sipGeneration
    if (!retry) {
      this.reconnectAttempts = 0
      this.clearReconnectTimer()
    }
    this.account = account
    this.closing = false
    this.emit({ type: 'connection', status: 'connecting' })
    const uri = UserAgent.makeURI(`sip:${account.username}@${account.domain}`)
    if (!uri) throw new Error('SIP 账号地址无效。')
    const authHa1 = account.ha1?.trim().toLowerCase()
    const ua = new UserAgent({
      uri,
      authorizationUsername: account.authorizationUsername || account.username,
      ...(authHa1 ? { authorizationHa1: authHa1 } : { authorizationPassword: account.password }),
      logBuiltinEnabled: false, logConfiguration: false, logConnector: () => {},
      reconnectionAttempts: 0,
      transportOptions: { server: account.server, traceSip: false, connectionTimeout: 10 },
      sessionDescriptionHandlerFactory: Web.defaultSessionDescriptionHandlerFactory(async () => {
        const owner = this.session
        const selected = this.inputDevice()
        const stream = await navigator.mediaDevices.getUserMedia({ audio: selected ? { deviceId: { exact: selected } } : true, video: false })
        if (this.closing || !owner || !this.isCurrent(owner) || owner.state === SessionState.Terminated) {
          stream.getTracks().forEach(track => track.stop())
          throw new Error('通话已取消。')
        }
        stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
          if (this.isCurrent(owner)) this.emit({ type: 'message', message: '麦克风已断开，请结束通话后重新选择可用设备。' })
        }))
        return stream
      }),
      // Default to empty iceServers for LAN deployments unless explicitly configured on the SIP profile.
      sessionDescriptionHandlerFactoryOptions: {
        iceGatheringTimeout: 2000,
        peerConnectionConfiguration: { iceServers: account.iceServers ?? [] },
      },
      delegate: {
        onInvite: invitation => {
          if (this.closing || this.session || this.isBusy()) { void invitation.reject({ statusCode: 486 }).catch(() => {}); return }
          const req = invitation.request as { callId?: string; getHeader?: (name: string) => string | undefined; to?: { uri?: { user?: string } } } | undefined
          const headerLineId = req?.getHeader?.('X-SimHub-Line-Id') || req?.getHeader?.('X-Line-Id')
          const headerOwnNumber = req?.getHeader?.('X-SimHub-Own-Number') || req?.getHeader?.('X-Own-Number')
          const headerPeerNumber = req?.getHeader?.('X-SimHub-Peer-Number') || req?.getHeader?.('X-Peer-Number')
          const headerTransfer = req?.getHeader?.('X-SimHub-Transfer')
          const headerTransferReason = req?.getHeader?.('X-SimHub-Transfer-Reason')
          const headerGatewayCallId = req?.getHeader?.('X-SimHub-Call-Id')
          const toUser = req?.to?.uri?.user
          const ownNumber = headerOwnNumber || account.phoneNumber || (toUser && toUser !== account.username ? toUser : undefined)
          this.attach(invitation, headerPeerNumber || invitation.remoteIdentity.uri.user || '未知来电', 'incoming', {
            sipCallId: req?.callId,
            gatewayCallId: headerGatewayCallId || undefined,
            lineId: headerLineId,
            ownNumber,
            accountKey: accountKey(account),
            transferSource: headerTransfer || undefined,
            transferReason: headerTransferReason || undefined,
          })
        },
        onDisconnect: () => {
          if (this.closing || this.reconnecting || gen !== this.sipGeneration) return
          const registrationPending = !!this.registrationCancel
          this.registrationCancel?.()
          const active = !!this.call
          this.finish('unknown')
          if (active) {
            this.emit({ type: 'connection', status: 'error', message: '连接已中断，通话结果未知。请确认后再重新连接。' })
            return
          }
          if (!registrationPending) this.scheduleReconnect('连接已断开，正在自动重连…')
        },
      },
    })
    this.ua = ua
    try {
      await ua.start()
      if (this.closing) return
      const expires = account.registrationExpiresSeconds && account.registrationExpiresSeconds > 0
        ? account.registrationExpiresSeconds
        : 300
      const registerer = new Registerer(ua, { expires, logConfiguration: false })
      await new Promise<void>((resolve, reject) => {
        let settled = false
        const finish = (error?: Error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          this.registrationCancel = undefined
          if (error) reject(error); else resolve()
        }
        const timer = setTimeout(() => finish(new ClientFailure('注册超时，请检查服务器与账号配置。')), 12000)
        this.registrationCancel = () => finish(new ClientFailure('注册连接已断开。'))
        registerer.stateChange.addListener(state => {
          if (this.closing || this.reconnecting || gen !== this.sipGeneration) return
          if (state === RegistererState.Registered) {
            this.reconnectAttempts = 0
            this.clearReconnectTimer()
            this.emit({ type: 'connection', status: 'registered' })
            finish()
          } else if (settled && state === RegistererState.Unregistered) {
            if (this.call) {
              this.emit({ type: 'connection', status: 'error', message: '分机注册已失效，请手动重新连接。' })
              return
            }
            this.scheduleReconnect('分机注册已失效，正在自动重连…')
          }
        })
        void registerer.register({
          requestDelegate: {
            onReject: response => finish(new ClientFailure(callFailureMessage(
              response.message.statusCode,
              response.message.getHeaders?.('Reason') ?? [],
            ))),
          },
        }).catch(() => finish(new ClientFailure('注册请求未完成，请检查服务器。')))
      })
    } catch (error) {
      const message = error instanceof ClientFailure ? error.message : '无法完成注册，请检查 WebSocket 地址、证书和账号凭据。'
      const permanent = message.includes('认证失败') || message.includes('权限') || message.includes('未找到分机')
      const shouldRetry = !this.closing && gen === this.sipGeneration && !permanent
      if (!this.closing && gen === this.sipGeneration) {
        this.emit({ type: 'connection', status: 'error', message })
      }
      this.reconnecting = true
      await ua.stop().catch(() => {})
      this.ua = undefined
      this.reconnecting = false
      if (shouldRetry) this.scheduleReconnect(message)
    }
  }

  async disconnect() {
    this.sipGeneration += 1
    this.closing = true
    this.reconnectAttempts = 0
    this.clearReconnectTimer()
    this.registrationCancel?.()
    await this.hangup().catch(() => {})
    this.finish('unknown')
    await this.ua?.stop().catch(() => {})
    this.ua = undefined
    this.account = undefined
    this.emit({ type: 'connection', status: 'offline' })
  }

  async dial(number: string, meta?: { lineId?: string; ownNumber?: string }) {
    if (!this.ua || !this.account || this.session) return
    const uri = UserAgent.makeURI(`sip:${number}@${this.account.domain}`)
    if (!uri) return
    const session = new Inviter(this.ua, uri, { sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } })
    const sipCallId = (session.request as { callId?: string } | undefined)?.callId
    this.attach(session, number, 'outgoing', {
      ...meta,
      ownNumber: meta?.ownNumber ?? accountDisplayNumber(this.account),
      accountKey: accountKey(this.account),
      sipCallId,
    })
    try {
      await session.invite({ requestDelegate: {
        onProgress: response => {
          if (this.isCurrent(session) && [180, 183].includes(response.message.statusCode ?? 0)) this.phase('ringing')
        },
        onReject: response => {
          if (!this.isCurrent(session) || this.localEnd) return
          const { message } = response
          const failure = classifyCallFailure(
            message.statusCode,
            message.getHeaders('Reason'),
            { peer: this.call?.peer, wasRinging: this.call?.phase === 'ringing' },
          )
          this.emit({ type: 'message', message: failure.message })
          this.finish(failure.outcome, failure.message)
        },
      } })
    } catch (error) {
      if (!this.isCurrent(session)) return
      const msg = mediaFailure(error)
      this.emit({ type: 'message', message: msg })
      await session.dispose().catch(() => {})
      this.finish('failed', msg)
    }
  }

  async answer() {
    const session = this.session
    if (!(session instanceof Invitation) || session.state !== SessionState.Initial) return
    this.phase('answering')
    try {
      await session.accept({ sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } })
    } catch (error) {
      if (this.session !== session) return
      const msg = mediaFailure(error)
      this.emit({ type: 'message', message: msg })
      await session.dispose().catch(() => {})
      this.finish('failed', msg)
    }
  }

  async hangup() {
    const session = this.session
    if (!session || this.endTimer) return
    this.localEnd = session.state === SessionState.Established ? 'completed' : session instanceof Invitation ? 'rejected' : 'cancelled'
    this.phase('ending')
    this.endTimer = setTimeout(() => {
      if (!this.isCurrent(session)) return
      this.finish('unknown', '未确认通话已结束，请核对线路状态。')
      this.emit({ type: 'connection', status: 'error', message: '未确认通话已结束，请核对线路状态后再重新连接；不会重发挂断。' })
    }, 10000)
    try {
      if (session.state === SessionState.Established) await session.bye()
      else if (session instanceof Inviter && [SessionState.Initial, SessionState.Establishing].includes(session.state)) await session.cancel()
      else if (session instanceof Invitation && session.state === SessionState.Initial) await session.reject({ statusCode: 603 })
    } catch {
      this.emit({ type: 'message', message: '挂断请求结果未知，请确认线路状态后再拨号。' })
      this.finish('unknown', '挂断请求结果未知')
      this.emit({ type: 'connection', status: 'error', message: '通话结果未知，请确认后重新连接。' })
    }
  }

  mute(muted: boolean) {
    this.muted = muted
    const handler = this.session?.sessionDescriptionHandler as Web.SessionDescriptionHandler | undefined
    handler?.localMediaStream.getAudioTracks().forEach(track => { track.enabled = !muted && !this.held })
    this.emit({ type: 'mute', muted })
  }

  async sendDtmf(digit: string) {
    const session = this.session
    if (!session || session.state !== SessionState.Established) return
    const tone = digit.trim().toUpperCase()
    if (!/^[0-9*#A-D]$/.test(tone)) throw new Error('无效的 DTMF 按键。')
    const handler = session.sessionDescriptionHandler as Web.SessionDescriptionHandler | undefined
    try {
      if (handler?.sendDtmf?.(tone)) return
      await session.info({
        requestOptions: {
          body: {
            contentDisposition: 'render',
            contentType: 'application/dtmf-relay',
            content: `Signal=${tone}\r\nDuration=160\r\n`,
          },
        },
      })
    } catch {
      if (this.isCurrent(session)) {
        this.emit({ type: 'message', message: '发送按键信号失败，当前对端可能不支持 DTMF。' })
      }
    }
  }

  async setHold(held: boolean) {
    const session = this.session
    if (!session || session.state !== SessionState.Established || this.holdBusy || this.held === held) return
    this.holdBusy = true
    try {
      await session.invite({
        sessionDescriptionHandlerOptions: { hold: held } as Web.SessionDescriptionHandlerOptions,
      })
      if (!this.isCurrent(session)) return
      this.held = held
      const handler = session.sessionDescriptionHandler as Web.SessionDescriptionHandler | undefined
      handler?.localMediaStream.getAudioTracks().forEach(track => { track.enabled = !held && !this.muted })
      this.audio.muted = held
      this.emit({ type: 'hold', held })
    } catch {
      if (this.isCurrent(session)) {
        this.emit({ type: 'message', message: '无法切换通话保持，请确认对端支持。' })
      }
    } finally {
      this.holdBusy = false
    }
  }

  private attach(session: Session, peer: string, direction: Call['direction'], meta?: { sipCallId?: string; gatewayCallId?: string; lineId?: string; ownNumber?: string; accountKey?: string; transferSource?: string; transferReason?: string }) {
    this.session = session
    this.localEnd = undefined
    this.call = { id: crypto.randomUUID(), peer, direction, phase: direction === 'incoming' ? 'incoming' : 'dialing', started: Date.now(), ...meta }
    this.emit({ type: 'call', call: this.call })
    let remoteByeReasons: string[] = []
    let remoteCancelReasons: string[] = []
    const prevDelegate = session.delegate ?? {}
    session.delegate = {
      ...prevDelegate,
      onBye: bye => {
        remoteByeReasons = bye.request?.getHeaders?.('Reason') ?? []
        prevDelegate.onBye?.(bye)
        void bye.accept().catch(() => {})
      },
      onCancel: cancel => {
        remoteCancelReasons = cancel.request?.getHeaders?.('Reason') ?? []
        prevDelegate.onCancel?.(cancel)
      },
    }
    session.stateChange.addListener(state => {
      if (this.session !== session) return
      if (state === SessionState.Established) {
        this.phase('connected')
        const handler = session.sessionDescriptionHandler as Web.SessionDescriptionHandler | undefined
        this.audio.srcObject = handler?.remoteMediaStream ?? null
        void this.audio.play().catch(() => this.emit({ type: 'message', message: '声音播放被暂停，请点击“播放声音”。' }))
      } else if (state === SessionState.Terminated) {
        if (direction === 'outgoing' && !this.call?.answered && !this.localEnd) {
          // SIP.js emits Terminated before delivering the final INVITE response.
          queueMicrotask(() => {
            if (this.isCurrent(session)) this.finish('failed')
          })
          return
        }
        if (this.call?.answered && !this.localEnd) {
          const midCallMsg = midCallByeFailureMessage(remoteByeReasons)
          if (midCallMsg) {
            this.emit({ type: 'message', message: midCallMsg })
            this.finish('failed', midCallMsg)
            return
          }
        }
        if (direction === 'incoming' && !this.call?.answered && !this.localEnd) {
          if (isCompletedElsewhere(remoteCancelReasons)) {
            this.finish('cancelled', '已在其他设备接听')
            return
          }
        }
        const outcome = this.localEnd ?? (this.call?.answered ? 'completed' : direction === 'incoming' ? 'missed' : 'failed')
        this.finish(outcome)
      }
    })
  }

  private isCurrent(session: Session): boolean { return this.session === session }

  private phase(phase: Call['phase']) {
    if (!this.call) return
    this.call = { ...this.call, phase, answered: phase === 'connected' ? Date.now() : this.call.answered }
    this.emit({ type: 'call', call: this.call })
  }

  private finish(outcome: Outcome, reasonText?: string) {
    clearTimeout(this.endTimer)
    this.endTimer = undefined
    const call = this.call
    if (!call) return
    const handler = this.session?.sessionDescriptionHandler as Web.SessionDescriptionHandler | undefined
    handler?.localMediaStream.getTracks().forEach(track => track.stop())
    handler?.close()
    this.audio.pause()
    this.audio.srcObject = null
    this.audio.muted = false
    this.muted = false
    this.held = false
    this.holdBusy = false
    this.call = undefined
    this.session = undefined
    this.emit({ type: 'end', id: call.id, outcome, at: Date.now(), ...(reasonText ? { reasonText } : {}) })
  }
}

import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import type { InviterInviteOptions } from 'sip.js'
import { initialState, reducePhone, type Account, type PhoneState } from '../types'

// Mock the SDK boundary, not SIP packets or a production server. These tests
// exercise the real client adapter's public state/error and teardown behavior.
const actual = await import('sip.js')
const makeURI = actual.UserAgent.makeURI
const { Core, SessionState, RegistererState } = actual
class Events<T> {
  listeners: ((value: T) => void)[] = []
  addListener(listener: (value: T) => void) { this.listeners.push(listener) }
  fire(value: T) { this.listeners.forEach(listener => listener(value)) }
}
let rejected = 0
class FakeAgent {
  static makeURI = makeURI
  static latest?: FakeAgent
  constructor(public options: {
    uri?: unknown
    authorizationUsername?: string
    authorizationPassword?: string
    authorizationHa1?: string
    delegate: {
      onInvite?: (invitation: unknown) => void
      onDisconnect: () => void
    }
  }) {
    FakeAgent.latest = this
  }
  async start() {}
  async stop() { this.options.delegate.onDisconnect() }
}
class FakeRegisterer {
  static latest: FakeRegisterer
  stateChange = new Events<string>()
  registerCalls = 0
  constructor() { FakeRegisterer.latest = this }
  async register(options: { requestDelegate: { onReject: (response: unknown) => void } }) {
    this.registerCalls += 1
    if (rejected) options.requestDelegate.onReject({ message: { statusCode: rejected } })
    else this.stateChange.fire(RegistererState.Registered)
  }
}
class FakeSession {
  static latest: FakeSession
  state = SessionState.Initial
  stateChange = new Events<string>()
  track = { enabled: true, stop() {} }
  dtmfResult = true
  dtmfSent: string[] = []
  infoCalls: unknown[] = []
  reinviteOptions: unknown[] = []
  rejectedStatus?: number
  sessionDescriptionHandler = {
    localMediaStream: { getTracks: () => [this.track], getAudioTracks: () => [this.track] },
    sendDtmf: (tones: string) => {
      this.dtmfSent.push(tones)
      return this.dtmfResult
    },
    close() {},
  }
  delegate?: {
    onBye?: (bye: { request?: { getHeaders?: (name: string) => string[] }; accept: () => Promise<void> }) => void
    onCancel?: (cancel: { request?: { getHeaders?: (name: string) => string[] } }) => void
  }
  byeAccepted = false
  private requestDelegate?: InviterInviteOptions['requestDelegate']
  constructor() { FakeSession.latest = this }
  transition(state: typeof SessionState[keyof typeof SessionState]) { this.state = state; this.stateChange.fire(state) }
  async invite(options: InviterInviteOptions) {
    if (this.state === SessionState.Established) {
      this.reinviteOptions.push(options)
      return
    }
    this.requestDelegate = options.requestDelegate
    this.transition(SessionState.Establishing)
  }
  async info(options: unknown) {
    this.infoCalls.push(options)
  }
  receiveProgress(statusCode = 180) {
    const message = new Core.IncomingResponseMessage()
    message.statusCode = statusCode
    this.requestDelegate?.onProgress?.({ message } as Parameters<NonNullable<NonNullable<InviterInviteOptions['requestDelegate']>['onProgress']>>[0])
  }
  receiveRejection(statusCode: number, reasons: readonly string[]) {
    const message = new Core.IncomingResponseMessage()
    message.statusCode = statusCode
    for (const reason of reasons) message.addHeader('Reason', reason)
    this.transition(SessionState.Terminated)
    this.requestDelegate?.onReject?.({ message })
  }
  receiveBye(reasons: readonly string[] = []) {
    const message = new Core.IncomingRequestMessage()
    for (const reason of reasons) message.addHeader('Reason', reason)
    this.delegate?.onBye?.({
      request: message,
      accept: async () => { this.byeAccepted = true },
    })
    this.transition(SessionState.Terminated)
  }
  receiveCancel(reasons: readonly string[] = []) {
    const message = new Core.IncomingRequestMessage()
    for (const reason of reasons) message.addHeader('Reason', reason)
    this.delegate?.onCancel?.({ request: message })
    this.transition(SessionState.Terminated)
  }
  async bye() { /* A sent BYE with no final teardown notification. */ }
  async cancel() { this.transition(SessionState.Terminated) }
  async reject(options?: { statusCode?: number }) {
    this.rejectedStatus = options?.statusCode ?? 603
    this.transition(SessionState.Terminated)
  }
  async dispose() { this.transition(SessionState.Terminated) }
}
mock.module('sip.js', () => ({
  ...actual, UserAgent: FakeAgent, Registerer: FakeRegisterer,
  Inviter: FakeSession, Invitation: class extends FakeSession {},
  Web: { defaultSessionDescriptionHandlerFactory: () => () => {} },
}))
const { SipPhone } = await import('./sip')
const profile: Account = { mode: 'sip', server: 'ws://127.0.0.1:5366', domain: 'webrtc.local', username: 'alice', password: 'fixture-only' }
function fixture() {
  let state: PhoneState = initialState
  const audio = { pause() {}, play: async () => {}, srcObject: null } as unknown as HTMLAudioElement
  const phone = new SipPhone(event => { state = reducePhone(state, event) }, audio, () => '')
  return { phone, state: () => state }
}
afterEach(() => { rejected = 0; mock.restore() })

describe('SIP 外呼失败提示', () => {
  test.each([
    { name: '欠费响应经 FreeSWITCH 映射为 403', status: 403, reasons: ['Q.850;cause=21', 'SIP;cause=402;text="CARRIER_CREDIT_LIMIT"'], message: '余额不足，无法拨打。', outcome: 'failed' as const },
    { name: '运营商拒绝服务', status: 603, reasons: ['SIP;cause=603;text="CARRIER_SERVICE_DENIED"'], message: '运营商拒绝提供本次通话服务。', outcome: 'failed' as const },
    { name: '空号', status: 404, reasons: ['SIP;cause=404;text="CARRIER_USER_UNKNOWN"'], message: '拨打的号码不存在。', outcome: 'failed' as const },
    { name: '短号未启用明确提示', status: 403, reasons: ['SIP;cause=403;text="TEST_ROUTE_DISABLED"'], message: '该测试短号未启用（可用 9196 / 9197 / 9201–9209）。', outcome: 'failed' as const },
    { name: '对方正忙', status: 486, reasons: ['SIP;cause=486;text="CARRIER_BUSY"'], message: '对方正在通话中或忙线。', outcome: 'rejected' as const },
    { name: '无法识别原因时使用状态码文案', status: 480, reasons: ['SIP;cause=480;text="other CARRIER_CREDIT_LIMIT"'], message: '对方暂时无法接听。', outcome: 'failed' as const },
    { name: '缺少 Reason 时使用状态码文案', status: 486, reasons: [], message: '线路或对方正忙。', outcome: 'rejected' as const },
    { name: '上游 487 保持失败而非取消', status: 487, reasons: ['SIP;cause=487;text="UPSTREAM_SIP_487"'], message: '上游网络终止了本次呼叫（SIP 487）。', outcome: 'failed' as const },
    { name: '线路停用状态透传', status: 503, reasons: ['SIP;cause=503;text="LINE_SUSPENDED"'], message: '当前号码线路已停用或暂停服务，请联系管理员。', outcome: 'failed' as const },
    { name: 'Q.850 原因码回退', status: 480, reasons: ['Q.850;cause=20;text="SUBSCRIBER_ABSENT"'], message: '对方暂时无法接听（关机或不在服务区）。', outcome: 'failed' as const },
  ])('$name', async ({ status, reasons, message, outcome }) => {
    const f = fixture()
    await f.phone.connect(profile)
    try {
      await f.phone.dial('9205')
      FakeSession.latest.receiveRejection(status, reasons)
      await Promise.resolve()
      expect(f.state().message).toBe(message)
      expect(f.state().call).toBeNull()
      expect(f.state().history.map(call => call.outcome)).toEqual([outcome])
      expect(f.state().history[0].reasonText).toBe(message)
    } finally {
      await f.phone.disconnect()
    }
  })

  test('通话中收到携带 ENGINE_MEDIA_FAILED 的 BYE 时应答 200 并记录为失败中断', async () => {
    const f = fixture()
    await f.phone.connect(profile)
    try {
      await f.phone.dial('9201')
      const sess = FakeSession.latest
      sess.transition(SessionState.Established)
      sess.receiveBye(['SIP;cause=500;text="ENGINE_MEDIA_FAILED"'])
      await Promise.resolve()
      expect(sess.byeAccepted).toBe(true)
      expect(f.state().call).toBeNull()
      expect(f.state().message).toBe('通话媒体异常中断，已自动结束。')
      expect(f.state().history[0].outcome).toBe('failed')
      expect(f.state().history[0].reasonText).toBe('通话媒体异常中断，已自动结束。')
    } finally {
      await f.phone.disconnect()
    }
  })

  test('通话中收到携带 Q.850;cause=41 的 BYE 时记录为失败中断，Q.850;cause=16 保持已完成', async () => {
    const f = fixture()
    await f.phone.connect(profile)
    try {
      await f.phone.dial('9204')
      const sess = FakeSession.latest
      sess.transition(SessionState.Established)
      sess.receiveBye(['Q.850;cause=41;text="TEMPORARY_FAILURE"'])
      await Promise.resolve()
      expect(sess.byeAccepted).toBe(true)
      expect(f.state().message).toBe('通话媒体异常中断，已自动结束。')
      expect(f.state().history[0].outcome).toBe('failed')
      expect(f.state().history[0].reasonText).toBe('通话媒体异常中断，已自动结束。')

      await f.phone.dial('9201')
      const normalSess = FakeSession.latest
      normalSess.transition(SessionState.Established)
      normalSess.receiveBye(['Q.850;cause=16;text="NORMAL_CLEARING"'])
      await Promise.resolve()
      expect(f.state().history[0].outcome).toBe('completed')
      expect(f.state().history[0].reasonText).toBeUndefined()
    } finally {
      await f.phone.disconnect()
    }
  })

  test('通话中收到正常 BYE 时记录为已完成且不误报异常', async () => {
    const f = fixture()
    await f.phone.connect(profile)
    try {
      await f.phone.dial('9201')
      const sess = FakeSession.latest
      sess.transition(SessionState.Established)
      sess.receiveBye([])
      await Promise.resolve()
      expect(sess.byeAccepted).toBe(true)
      expect(f.state().history[0].outcome).toBe('completed')
      expect(f.state().history[0].reasonText).toBeUndefined()
    } finally {
      await f.phone.disconnect()
    }
  })

  test('多端同振来电被其他设备接听后（Call completed elsewhere）记录为已取消而非漏接', async () => {
    const f = fixture()
    await f.phone.connect(profile)
    try {
      const InvitationCtor = (await import('sip.js')).Invitation as unknown as new () => FakeSession
      const incoming = new InvitationCtor() as FakeSession & {
        request?: { callId?: string; getHeader?: (name: string) => string | undefined; to?: { uri?: { user?: string } } }
        remoteIdentity: { uri: { user?: string } }
      }
      incoming.request = {
        callId: 'sip-call-elsewhere',
        getHeader: (name: string) => ({
          'X-SimHub-Line-Id': 'line-a',
          'X-SimHub-Own-Number': '+15550000100',
          'X-SimHub-Peer-Number': '+15559990001',
          'X-SimHub-Call-Id': 'gw-call-99',
        }[name]),
      }
      incoming.remoteIdentity = { uri: { user: '+15559990001' } }
      FakeAgent.latest?.options.delegate.onInvite?.(incoming)
      expect(f.state().call?.gatewayCallId).toBe('gw-call-99')
      incoming.receiveCancel(['SIP;cause=200;text="Call completed elsewhere"'])
      await Promise.resolve()
      expect(f.state().call).toBeNull()
      expect(f.state().history[0].outcome).toBe('cancelled')
      expect(f.state().history[0].reasonText).toBe('已在其他设备接听')
    } finally {
      await f.phone.disconnect()
    }
  })

  test('振铃超时 408 提示对方无人接听并记入历史', async () => {
    const f = fixture()
    await f.phone.connect(profile)
    try {
      await f.phone.dial('9203')
      FakeSession.latest.receiveProgress(180)
      FakeSession.latest.receiveRejection(408, [])
      await Promise.resolve()
      expect(f.state().message).toBe('对方无人接听，已自动挂断。')
      expect(f.state().history[0].reasonText).toBe('对方无人接听，已自动挂断。')
    } finally {
      await f.phone.disconnect()
    }
  })
})

describe('SIP 客户端收尾', () => {
  test('注册认证失败提示不会被随后断开事件覆盖', async () => {
    rejected = 401
    const f = fixture()
    await f.phone.connect(profile)
    expect(f.state().connection).toBe('error')
    expect(f.state().message).toContain('账号认证失败')
  })
  test('分机注册失效且当前无通话时自动重新注册', async () => {
    const f = fixture()
    await f.phone.connect(profile)
    expect(f.state().connection).toBe('registered')
    const first = FakeRegisterer.latest
    const original = globalThis.setTimeout
    const timer = spyOn(globalThis, 'setTimeout').mockImplementation(((handler: () => void, delay?: number) => original(handler, delay && delay >= 1000 ? 5 : delay)) as typeof setTimeout)
    try {
      first.stateChange.fire(RegistererState.Unregistered)
      await Bun.sleep(40)
      expect(FakeRegisterer.latest).not.toBe(first)
      expect(FakeRegisterer.latest.registerCalls).toBe(1)
      expect(f.state().connection).toBe('registered')
    } finally { timer.mockRestore(); await f.phone.disconnect() }
  })
  test('挂断后没有结束通知时转为结果未知，不永久停在正在结束', async () => {
    const f = fixture()
    await f.phone.connect(profile)
    await f.phone.dial('9197')
    FakeSession.latest.transition(SessionState.Established)
    const original = globalThis.setTimeout
    const timer = spyOn(globalThis, 'setTimeout').mockImplementation(((handler: () => void, delay?: number) => original(handler, delay && delay >= 1000 ? 5 : delay)) as typeof setTimeout)
    try {
      await f.phone.hangup()
      await Bun.sleep(40)
      expect(f.state().call).toBeNull()
      expect(f.state().history[0].outcome).toBe('unknown')
      expect(f.state().connection).toBe('error')
    } finally { timer.mockRestore(); await f.phone.disconnect() }
  })
  test('支持 E.164 号码用户名及标准 Digest HA1 认证（无需明文密码）', async () => {
    const f = fixture()
    const ha1Account: Account = {
      mode: 'sip',
      server: 'wss://pbx.example.invalid/sip',
      domain: 'webrtc.local',
      username: '+15550000001',
      authorizationUsername: '+15550000001',
      password: '',
      ha1: '8A4F2C9012E34B567890ABCDEF123456',
    }
    await f.phone.connect(ha1Account)
    try {
      expect(f.state().connection).toBe('registered')
      expect(FakeAgent.latest?.options.authorizationUsername).toBe('+15550000001')
      expect(FakeAgent.latest?.options.authorizationHa1).toBe('8a4f2c9012e34b567890abcdef123456')
      expect(FakeAgent.latest?.options.authorizationPassword).toBeUndefined()
    } finally {
      await f.phone.disconnect()
    }
  })
  test('来电携带 X-SimHub-Transfer 时记录 AI 转人工标识和原因并在接听后保留', async () => {
    const f = fixture()
    await f.phone.connect(profile)
    const InvitationCtor = (await import('sip.js')).Invitation as unknown as new () => FakeSession
    const incoming = new InvitationCtor() as FakeSession & {
      request?: { callId?: string; getHeader?: (name: string) => string | undefined; to?: { uri?: { user?: string } } }
      remoteIdentity: { uri: { user?: string } }
    }
    const headers: Record<string, string> = {
      'X-SimHub-Line-Id': 'line-1',
      'X-SimHub-Own-Number': '+15550000100',
      'X-SimHub-Peer-Number': '+15559990001',
      'X-SimHub-Transfer': 'ai_handoff',
      'X-SimHub-Transfer-Reason': 'billing_issue',
    }
    incoming.request = {
      callId: 'sip-call-ai-1',
      getHeader: (name: string) => headers[name],
      to: { uri: { user: '+15550000100' } },
    }
    incoming.remoteIdentity = { uri: { user: '+15559990001' } }
    FakeAgent.latest?.options.delegate.onInvite?.(incoming)
    expect(f.state().call?.transferSource).toBe('ai_handoff')
    expect(f.state().call?.transferReason).toBe('billing_issue')
    expect(f.state().call?.ownNumber).toBe('+15550000100')
    incoming.transition(SessionState.Established)
    expect(f.state().call?.phase).toBe('connected')
    expect(f.state().call?.transferSource).toBe('ai_handoff')
    expect(f.state().call?.transferReason).toBe('billing_issue')
    await f.phone.disconnect()
  })
  test('通话中支持 RFC 4733 DTMF（含 SIP INFO 回退）与 re-INVITE 保持恢复', async () => {
    const f = fixture()
    await f.phone.connect(profile)
    await f.phone.dial('9197')
    const sess = FakeSession.latest
    sess.transition(SessionState.Established)

    await f.phone.sendDtmf('1')
    expect(sess.dtmfSent).toEqual(['1'])
    sess.dtmfResult = false
    await f.phone.sendDtmf('#')
    expect(sess.infoCalls).toHaveLength(1)

    await f.phone.setHold(true)
    expect(f.state().held).toBe(true)
    expect(sess.track.enabled).toBe(false)
    expect((sess.reinviteOptions[0] as { sessionDescriptionHandlerOptions?: { hold?: boolean } }).sessionDescriptionHandlerOptions?.hold).toBe(true)

    await f.phone.setHold(false)
    expect(f.state().held).toBe(false)
    expect(sess.track.enabled).toBe(true)
    expect((sess.reinviteOptions[1] as { sessionDescriptionHandlerOptions?: { hold?: boolean } }).sessionDescriptionHandlerOptions?.hold).toBe(false)

    await f.phone.disconnect()
  })
  test('外部占麦回调为忙时自动以 486 拒接新来电', async () => {
    let state: PhoneState = initialState
    const audio = { pause() {}, play: async () => {}, srcObject: null, muted: false } as unknown as HTMLAudioElement
    const phone = new SipPhone(event => { state = reducePhone(state, event) }, audio, () => '', () => true)
    await phone.connect(profile)
    const InvitationCtor = (await import('sip.js')).Invitation as unknown as new () => FakeSession
    const incoming = new InvitationCtor()
    FakeAgent.latest?.options.delegate.onInvite?.(incoming)
    expect(incoming.rejectedStatus).toBe(486)
    expect(state.call).toBeNull()
    await phone.disconnect()
  })
})

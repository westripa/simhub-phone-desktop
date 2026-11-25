import { describe, expect, test } from 'bun:test'
import { emptyAccount, hasAccountCredential, initialState, normalizeNumber, reducePhone, validateAccount, type PhoneState } from '../types'
import { DemoPhone } from './demo'

describe('客户端边界', () => {
  test('数字拨号不接受 SIP URI 或任意目标注入', () => {
    expect(normalizeNumber(' (919)-7 ')).toBe('9197')
    expect(normalizeNumber('+1 234')).toBe('+1234')
    for (const value of ['', '+', '9197@example.local', 'sip:9197', '91;97', '1234567890123456', '9197\n9198']) {
      expect(() => normalizeNumber(value)).toThrow()
    }
  })

  test('标准 SIP 配置支持 + 号号码与 HA1，并拒绝非回环 WS 或无效 HA1', () => {
    const base = {
      ...emptyAccount,
      mode: 'sip' as const,
      server: 'wss://pbx.example.local/sip',
      domain: 'webrtc.local',
      username: '+15550000001',
      password: '',
      ha1: '8a4f2c9012e34b567890abcdef123456',
      iceServers: [{ urls: 'stun:stun.example.local:3478' }],
    }
    expect(hasAccountCredential(base)).toBe(true)
    expect(() => validateAccount(base)).not.toThrow()
    expect(() => validateAccount({ ...base, server: 'ws://127.0.0.1:5366', username: 'client1_15550000001' })).not.toThrow()
    expect(() => validateAccount({ ...base, username: 'alice-desk.01', authorizationUsername: 'auth_01' })).not.toThrow()

    for (const server of ['ws://pbx.example.local', 'https://pbx.example.local', 'wss://fixture@pbx.example.local', 'wss://pbx.example.local?token=fixture']) {
      expect(() => validateAccount({ ...base, server })).toThrow()
    }
    expect(() => validateAccount({ ...base, username: 'alice@example.local' })).toThrow()
    expect(() => validateAccount({ ...base, ha1: 'not-md5-hex' })).toThrow()
    expect(() => validateAccount({ ...base, ha1: undefined, password: '' }, true)).toThrow()
    expect(() => validateAccount({ ...base, iceServers: [{ urls: 'http://bad.example.local' }] })).toThrow()
  })

  test('通话记录保留标准 SIP 头传递的本机号码', () => {
    let state = reducePhone(initialState, {
      type: 'call',
      call: { id: 'call-1', peer: '13800138000', direction: 'incoming', phase: 'incoming', started: 1, ownNumber: '+15550000001' },
    })
    state = reducePhone(state, { type: 'end', id: 'call-1', outcome: 'missed', at: 2 })
    expect(state.history[0].peer).toBe('13800138000')
    expect(state.history[0].ownNumber).toBe('+15550000001')
  })

  test('取消演示外呼后，迟到的接通计时器不会恢复通话', async () => {
    let state: PhoneState = initialState
    const phone = new DemoPhone(event => { state = reducePhone(state, event) })
    await phone.connect(emptyAccount)
    await phone.dial('9197')
    await phone.hangup()
    await Bun.sleep(2100)
    expect(state.call).toBeNull()
    expect(state.history).toHaveLength(1)
    expect(state.history[0].outcome).toBe('cancelled')
    await phone.disconnect()
  })
})

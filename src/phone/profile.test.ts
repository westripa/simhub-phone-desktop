import { expect, test } from 'bun:test'
import { loadAccounts, loadProfile, saveAccounts, saveProfile, upsertAccountList } from './profile'
import { accountKey, type Account } from './types'

test('只有用户选择记住的非秘密 SIP 账号信息可以保留，密码、HA1 与 TURN 凭据均不落盘', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }

  const profile: Account = {
    mode: 'sip',
    server: 'wss://pbx.example.local:8465/sip',
    domain: 'webrtc.local',
    username: 'c_device_1',
    phoneNumber: '+15550000001',
    authorizationUsername: 'client1_15550000001',
    realm: 'webrtc.local',
    password: 'fixture-private-password',
    ha1: '8a4f2c9012e34b567890abcdef123456',
    registrationExpiresSeconds: 300,
    iceServers: [{ urls: 'stun:stun.example.local:3478', username: 'u', credential: 'turn-secret-password' }],
    remember: true,
  }
  expect(saveProfile(profile, storage)).toBe(true)
  const serialized = [...values.values()].join('')
  expect(serialized).not.toContain(profile.password)
  expect(serialized).not.toContain(profile.ha1!)
  expect(serialized).not.toContain('turn-secret-password')

  expect(loadProfile(storage)).toEqual({
    mode: 'sip',
    server: 'wss://pbx.example.local:8465/sip',
    domain: 'webrtc.local',
    username: 'c_device_1',
    phoneNumber: '+15550000001',
    authorizationUsername: 'client1_15550000001',
    realm: 'webrtc.local',
    registrationExpiresSeconds: 300,
    iceServers: [{ urls: 'stun:stun.example.local:3478' }],
    password: '',
    remember: true,
  })

  // Legacy gateway entries stored in older versions must fall back safely.
  values.set('simhub.phone.profile.v1', JSON.stringify({
    version: 1,
    mode: 'gateway',
    server: 'https://gateway.example.local',
    username: 'operator',
  }))
  expect(loadProfile(storage)).toEqual({ mode: 'demo', server: '', domain: '', username: '', password: '' })

  saveProfile({ ...profile, remember: false }, storage)
  expect(values.size).toBe(0)
})

test('多号码列表支持按 username@domain 叠加与幂等刷新，迁移 v1 且不持久化密钥', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }

  const acc1: Account = {
    mode: 'sip',
    server: 'wss://pbx.example.local:8465/sip',
    domain: 'webrtc.local',
    username: '+15550000001',
    password: 'secret-1',
    ha1: '8a4f2c9012e34b567890abcdef123456',
    label: '客服1',
    group: '客服组',
    remember: true,
  }
  const acc2: Account = {
    mode: 'sip',
    server: 'wss://pbx.example.local:8465/sip',
    domain: 'webrtc.local',
    username: '+15550000002',
    password: '',
    ha1: '9b4f2c9012e34b567890abcdef123456',
    remember: true,
  }
  const acc3Transient: Account = {
    mode: 'sip',
    server: 'wss://pbx.example.local:8465/sip',
    domain: 'webrtc.local',
    username: '+15550000003',
    password: 'temp-password',
    remember: false,
  }

  // Additive append then idempotent update by username@domain (ignoring domain case).
  const merged = upsertAccountList([acc1], [
    acc2,
    { ...acc1, domain: 'WEBRTC.LOCAL', server: 'wss://pbx2.example.local:8465/sip' },
  ])
  expect(merged).toHaveLength(2)
  expect(merged[0].server).toBe('wss://pbx2.example.local:8465/sip')
  expect(merged[1].username).toBe('+15550000002')

  // v1 fallback migration
  saveProfile(acc1, storage)
  expect(loadAccounts(storage).accounts.map(a => accountKey(a))).toEqual(['+15550000001@webrtc.local'])

  // v2 strips secrets and excludes remember=false accounts.
  expect(saveAccounts([acc1, acc2, acc3Transient], accountKey(acc2), storage)).toBe(true)
  const raw = [...values.values()].join('')
  expect(raw).not.toContain('secret-1')
  expect(raw).not.toContain(acc1.ha1!)
  expect(raw).not.toContain('+15550000003')

  const loaded = loadAccounts(storage)
  expect(loaded.activeKey).toBe('+15550000002@webrtc.local')
  expect(loaded.accounts.map(a => a.username)).toEqual(['+15550000001', '+15550000002'])
  expect(loaded.accounts[0].group).toBe('客服组')
  expect(loaded.accounts[0].label).toBe('客服1')
  expect(loaded.accounts[0].password).toBe('')
  expect(loaded.accounts[0].ha1).toBeUndefined()

  saveAccounts([], '', storage)
  expect(values.size).toBe(0)
})

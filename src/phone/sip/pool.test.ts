import { describe, expect, test } from 'bun:test'
import { accountKey, initialState, reducePhone, type Account, type Emit, type PhoneState, type Transport } from '../types'
import { AccountPool, type PoolSnapshot } from './pool'

class FakeMultiTransport implements Transport {
  static instances = new Map<string, FakeMultiTransport>()
  connectCount = 0
  disconnectCount = 0
  dialed: { number: string; ownNumber?: string }[] = []
  account?: Account
  constructor(private emit: Emit, private isBusy: () => boolean) {}
  async connect(account: Account) {
    this.account = account
    this.connectCount += 1
    FakeMultiTransport.instances.set(accountKey(account), this)
    this.emit({ type: 'connection', status: 'registered' })
  }
  async disconnect() {
    this.disconnectCount += 1
    this.emit({ type: 'connection', status: 'offline' })
  }
  async dial(number: string, meta?: { lineId?: string; ownNumber?: string }) {
    this.dialed.push({ number, ownNumber: meta?.ownNumber })
    this.emit({
      type: 'call',
      call: {
        id: `call-${this.account?.username}-${number}`,
        peer: number,
        direction: 'outgoing',
        phase: 'dialing',
        started: Date.now(),
        ownNumber: meta?.ownNumber,
      },
    })
  }
  async answer() {}
  async hangup() {
    if (!this.account) return
    const last = this.dialed[this.dialed.length - 1]
    this.emit({
      type: 'end',
      id: `call-${this.account.username}-${last?.number ?? 'x'}`,
      outcome: 'completed',
      at: Date.now(),
    })
  }
  mute() {}
  canAcceptIncoming(): boolean {
    return !this.isBusy()
  }
  triggerIncoming(peer: string) {
    if (this.isBusy()) return false
    this.emit({
      type: 'call',
      call: {
        id: `in-${this.account?.username}-${peer}`,
        peer,
        direction: 'incoming',
        phase: 'incoming',
        started: Date.now(),
        ownNumber: this.account?.username,
      },
    })
    return true
  }
}

const makeAccount = (username: string, ha1 = '8a4f2c9012e34b567890abcdef123456'): Account => ({
  mode: 'sip',
  server: 'wss://pbx.example.local/sip',
  domain: 'webrtc.local',
  username,
  password: '',
  ha1,
  remember: true,
})

function setupPool() {
  FakeMultiTransport.instances.clear()
  let state: PhoneState = initialState
  let snap: PoolSnapshot = { mode: 'demo', accounts: [], defaultKey: '' }
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  }
  const pool = new AccountPool(
    event => { state = reducePhone(state, event) },
    s => { snap = s },
    {
      createSip: (emit, isBusy) => new FakeMultiTransport(emit, isBusy),
      storage,
    },
  )
  return { pool, state: () => state, snap: () => snap }
}

describe('多账号连接池与单路占麦互斥', () => {
  test('支持批量叠加导入并在新增号段时保持已有账号在线不重连', async () => {
    const f = setupPool()
    const acc1 = makeAccount('+15550000001')
    const acc2 = makeAccount('+15550000002')
    await f.pool.upsertAndConnect([acc1, acc2])
    expect(f.snap().accounts.map(a => a.key)).toEqual([
      '+15550000001@webrtc.local',
      '+15550000002@webrtc.local',
    ])
    expect(f.snap().accounts.every(a => a.status === 'registered')).toBe(true)

    const t1Before = FakeMultiTransport.instances.get('+15550000001@webrtc.local')!
    const t2Before = FakeMultiTransport.instances.get('+15550000002@webrtc.local')!
    expect(t1Before.connectCount).toBe(1)
    expect(t2Before.connectCount).toBe(1)

    // Add account 3: accounts 1 & 2 stay untouched!
    const acc3 = makeAccount('+15550000003')
    await f.pool.upsertAndConnect([acc3])
    expect(f.snap().accounts).toHaveLength(3)
    expect(t1Before.disconnectCount).toBe(0)
    expect(t2Before.disconnectCount).toBe(0)

    // Re-import account 1 with refreshed HA1: updates in-place without duplicate slot.
    await f.pool.upsertAndConnect([makeAccount('+15550000001', '11112222333344445555666677778888')])
    expect(f.snap().accounts).toHaveLength(3)
    expect(t1Before.disconnectCount).toBe(1)
    expect(t2Before.disconnectCount).toBe(0)
  })

  test('支持切换默认出局主叫号，并在通话期间阻止第二路来电占用麦克风', async () => {
    const f = setupPool()
    await f.pool.upsertAndConnect([makeAccount('+15550000001'), makeAccount('+15550000002')])

    f.pool.setDefaultAccount('+15550000002@webrtc.local')
    await f.pool.dial('9201')
    const t1 = FakeMultiTransport.instances.get('+15550000001@webrtc.local')!
    const t2 = FakeMultiTransport.instances.get('+15550000002@webrtc.local')!
    expect(t2.dialed).toEqual([{ number: '9201', ownNumber: '+15550000002' }])
    expect(f.state().call?.accountKey).toBe('+15550000002@webrtc.local')

    // Removing the account in call is refused; removing idle account 1 succeeds.
    expect(await f.pool.removeAccount('+15550000002@webrtc.local')).toBe(false)
    expect(t1.triggerIncoming('13800138000')).toBe(false)

    await f.pool.hangup()
    expect(f.state().call).toBeNull()
    expect(t1.triggerIncoming('13800138000')).toBe(true)
    expect(f.state().call?.ownNumber).toBe('+15550000001')

    await f.pool.hangup()
    expect(await f.pool.removeAccount('+15550000001@webrtc.local')).toBe(true)
    expect(f.snap().accounts.map(a => a.key)).toEqual(['+15550000002@webrtc.local'])
  })

  test('可在不断线的情况下在线更新号码备注和所属号码组', async () => {
    const f = setupPool()
    await f.pool.upsertAndConnect([makeAccount('+15550000001')])
    const t1 = FakeMultiTransport.instances.get('+15550000001@webrtc.local')!
    f.pool.updateAccountMeta('+15550000001@webrtc.local', { label: '前台客服', group: '值班组' })
    expect(f.snap().accounts[0].account.label).toBe('前台客服')
    expect(f.snap().accounts[0].account.group).toBe('值班组')
    expect(t1.disconnectCount).toBe(0)
  })

  test('多客户端登录账号呼出时优先使用绑定的 phoneNumber 作为 ownNumber', async () => {
    const f = setupPool()
    const multiClient: Account = {
      ...makeAccount('c_device_101'),
      phoneNumber: '+15550000101',
    }
    await f.pool.upsertAndConnect([multiClient])
    await f.pool.dial('9201')
    const t = FakeMultiTransport.instances.get('c_device_101@webrtc.local')!
    expect(t.dialed).toEqual([{ number: '9201', ownNumber: '+15550000101' }])
    expect(f.state().call?.ownNumber).toBe('+15550000101')
  })
})

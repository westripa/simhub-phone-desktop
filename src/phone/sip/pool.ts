import {
  loadAccounts,
  saveAccounts,
  upsertAccountList,
  type SavedAccounts,
} from '../profile'
import {
  accountDisplayNumber,
  accountKey,
  hasAccountCredential,
  normalizeAccountGroup,
  normalizeNumber,
  validateAccount,
  type Account,
  type Connection,
  type Emit,
  type Event,
  type Transport,
} from '../types'
import { DemoPhone } from './demo'

export interface AccountSlot {
  key: string
  account: Account
  status: Connection
  message: string
}

export interface PoolSnapshot {
  mode: 'demo' | 'sip'
  accounts: AccountSlot[]
  defaultKey: string
}

interface PoolEntry {
  key: string
  account: Account
  status: Connection
  message: string
  transport: Transport
}

export interface AccountPoolDeps {
  createSip: (emit: Emit, isBusy: () => boolean) => Transport
  createDemo?: (emit: Emit) => Transport
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
}

const emptySnapshot: PoolSnapshot = { mode: 'demo', accounts: [], defaultKey: '' }

export class AccountPool {
  private entries = new Map<string, PoolEntry>()
  private order: string[] = []
  private defaultKey = ''
  private mode: 'demo' | 'sip' = 'demo'
  private demoEntry?: PoolEntry
  private activeCallKey: string | null = null
  private generation = 0
  private lastConnection: { status: Connection; message: string } = { status: 'offline', message: '' }

  constructor(
    private onEvent: Emit,
    private onSnapshot: (snapshot: PoolSnapshot) => void,
    private deps: AccountPoolDeps,
  ) {}

  hydrateSaved(saved?: SavedAccounts): PoolSnapshot {
    const loaded = saved ?? loadAccounts(this.deps.storage)
    if (!loaded.accounts.length) {
      this.mode = 'demo'
      this.entries.clear()
      this.order = []
      this.defaultKey = ''
      const snap = { ...emptySnapshot }
      this.onSnapshot(snap)
      return snap
    }
    this.mode = 'sip'
    this.entries.clear()
    this.order = []
    for (const acc of loaded.accounts) {
      const k = accountKey(acc)
      this.entries.set(k, this.makeSipEntry(acc, k))
      this.order.push(k)
    }
    this.defaultKey = this.entries.has(loaded.activeKey) ? loaded.activeKey : (this.order[0] ?? '')
    return this.emitSnapshot()
  }

  snapshot(): PoolSnapshot {
    return {
      mode: this.mode,
      defaultKey: this.defaultKey,
      accounts: this.order
        .map(k => this.entries.get(k))
        .filter((e): e is PoolEntry => Boolean(e))
        .map(e => ({ key: e.key, account: e.account, status: e.status, message: e.message })),
    }
  }

  private emitSnapshot(): PoolSnapshot {
    const snap = this.snapshot()
    this.onSnapshot(snap)
    return snap
  }

  private makeSipEntry(account: Account, key: string): PoolEntry {
    const transport = this.deps.createSip(
      event => this.handleSlotEvent(key, event),
      () => this.activeCallKey !== null,
    )
    return {
      key,
      account,
      status: 'offline',
      message: '',
      transport,
    }
  }

  private handleSlotEvent(slotKey: string, event: Event) {
    if (this.mode === 'demo' && slotKey !== 'demo') return
    if (this.mode === 'sip' && slotKey === 'demo') return
    const entry = slotKey === 'demo' ? this.demoEntry : this.entries.get(slotKey)
    if (!entry) return

    switch (event.type) {
      case 'connection': {
        entry.status = event.status
        entry.message = event.message ?? ''
        this.emitAggregateConnection()
        this.emitSnapshot()
        return
      }
      case 'call': {
        if (this.activeCallKey && this.activeCallKey !== slotKey) return
        this.activeCallKey = slotKey
        this.onEvent({
          type: 'call',
          call: {
            ...event.call,
            accountKey: event.call.accountKey ?? slotKey,
          },
        })
        return
      }
      case 'end': {
        if (this.activeCallKey === slotKey) {
          this.activeCallKey = null
        }
        this.onEvent(event)
        return
      }
      case 'mute':
      case 'hold':
      case 'clear-history': {
        if (this.activeCallKey === slotKey || slotKey === 'demo') {
          this.onEvent(event)
        }
        return
      }
      case 'message': {
        this.onEvent(event)
        return
      }
    }
  }

  private emitAggregateConnection() {
    if (this.mode === 'demo') {
      const status = this.demoEntry?.status ?? 'offline'
      const message = this.demoEntry?.message ?? ''
      if (this.lastConnection.status !== status || this.lastConnection.message !== message) {
        this.lastConnection = { status, message }
        this.onEvent({ type: 'connection', status, message })
      }
      return
    }
    const slots = this.order.map(k => this.entries.get(k)).filter((e): e is PoolEntry => Boolean(e))
    let status: Connection = 'offline'
    let message = ''
    if (slots.some(s => s.status === 'registered')) {
      status = 'registered'
    } else if (slots.some(s => s.status === 'connecting')) {
      status = 'connecting'
    } else {
      const errSlot = slots.find(s => s.status === 'error')
      if (errSlot) {
        status = 'error'
        message = errSlot.message
      }
    }
    if (this.lastConnection.status !== status || this.lastConnection.message !== message) {
      this.lastConnection = { status, message }
      this.onEvent({ type: 'connection', status, message })
    }
  }

  private persistSipAccounts() {
    const accounts = this.order
      .map(k => this.entries.get(k)?.account)
      .filter((a): a is Account => Boolean(a))
    saveAccounts(accounts, this.defaultKey, this.deps.storage)
  }

  async connectDemo() {
    const current = ++this.generation
    await this.disconnectAllSip()
    if (this.generation !== current) return
    this.mode = 'demo'
    if (this.demoEntry) {
      await this.demoEntry.transport.disconnect().catch(() => {})
    }
    const createDemo = this.deps.createDemo ?? (emit => new DemoPhone(emit))
    const demoAccount: Account = { mode: 'demo', server: '', domain: '', username: '', password: '' }
    this.demoEntry = {
      key: 'demo',
      account: demoAccount,
      status: 'connecting',
      message: '',
      transport: createDemo(ev => this.handleSlotEvent('demo', ev)),
    }
    this.emitAggregateConnection()
    this.emitSnapshot()
    await this.demoEntry.transport.connect(demoAccount)
  }

  async upsertAndConnect(accounts: Account[], selectKey?: string) {
    if (!accounts.length) throw new Error('请至少提供一个 SIP 账号。')
    for (const acc of accounts) {
      validateAccount(acc, true)
    }
    const current = ++this.generation
    if (this.mode === 'demo' && this.demoEntry) {
      await this.demoEntry.transport.disconnect().catch(() => {})
      this.demoEntry = undefined
    }
    if (this.generation !== current) return
    this.mode = 'sip'

    const merged = upsertAccountList(
      this.order.map(k => this.entries.get(k)?.account).filter((a): a is Account => Boolean(a)),
      accounts,
    )
    const incomingKeys = new Set(accounts.map(a => accountKey(a)))
    const toConnect: PoolEntry[] = []

    for (const acc of merged) {
      const k = accountKey(acc)
      const existing = this.entries.get(k)
      if (!existing) {
        const entry = this.makeSipEntry(acc, k)
        this.entries.set(k, entry)
        this.order.push(k)
        toConnect.push(entry)
      } else if (incomingKeys.has(k)) {
        if (existing.status === 'registered' || existing.status === 'connecting') {
          await existing.transport.disconnect().catch(() => {})
        }
        const refreshed = this.makeSipEntry(acc, k)
        this.entries.set(k, refreshed)
        toConnect.push(refreshed)
      }
    }

    if (this.generation !== current) return
    if (selectKey && this.entries.has(selectKey)) {
      this.defaultKey = selectKey
    } else if (!this.defaultKey || !this.entries.has(this.defaultKey)) {
      this.defaultKey = accountKey(accounts[0])
    }
    this.persistSipAccounts()
    this.emitAggregateConnection()
    this.emitSnapshot()

    await Promise.allSettled(toConnect.map(entry => {
      entry.status = 'connecting'
      entry.message = ''
      this.emitAggregateConnection()
      this.emitSnapshot()
      return entry.transport.connect(entry.account)
    }))
  }

  async configureAccount(account: Account) {
    validateAccount(account, false)
    if (account.mode === 'demo') return
    const k = accountKey(account)
    if (this.mode === 'demo' && this.demoEntry) {
      await this.demoEntry.transport.disconnect().catch(() => {})
      this.demoEntry = undefined
    }
    this.mode = 'sip'
    const existing = this.entries.get(k)
    const sanitized: Account = { ...account, password: '', ha1: undefined }
    if (existing) {
      if (this.activeCallKey === k) {
        this.onEvent({ type: 'message', message: '该号码正在通话中，暂不能修改。' })
        return
      }
      await existing.transport.disconnect().catch(() => {})
      existing.account = sanitized
      existing.status = 'offline'
      existing.message = ''
    } else {
      this.entries.set(k, this.makeSipEntry(sanitized, k))
      this.order.push(k)
    }
    if (!this.defaultKey || !this.entries.has(this.defaultKey)) {
      this.defaultKey = k
    }
    this.persistSipAccounts()
    this.emitAggregateConnection()
    this.emitSnapshot()
  }

  async connectAccount(key: string) {
    const entry = this.entries.get(key)
    if (!entry) return
    if (!hasAccountCredential(entry.account)) {
      throw new Error('该号码未保存内存凭据，请编辑填写密码或重新导入 HA1 配网。')
    }
    this.mode = 'sip'
    entry.status = 'connecting'
    entry.message = ''
    this.emitAggregateConnection()
    this.emitSnapshot()
    await entry.transport.connect(entry.account)
  }

  async disconnectAccount(key: string) {
    const entry = this.entries.get(key)
    if (!entry) return
    await entry.transport.disconnect().catch(() => {})
    if (this.activeCallKey === key) {
      this.activeCallKey = null
    }
    entry.status = 'offline'
    entry.message = ''
    entry.account = { ...entry.account, password: '', ha1: undefined }
    this.emitAggregateConnection()
    this.emitSnapshot()
  }

  async disconnectAll() {
    ++this.generation
    if (this.mode === 'demo' && this.demoEntry) {
      await this.demoEntry.transport.disconnect().catch(() => {})
      this.demoEntry.status = 'offline'
      this.demoEntry.message = ''
      if (this.activeCallKey === 'demo') this.activeCallKey = null
      this.emitAggregateConnection()
      this.emitSnapshot()
      return
    }
    await this.disconnectAllSip()
    this.emitAggregateConnection()
    this.emitSnapshot()
  }

  private async disconnectAllSip() {
    const targets = this.order.map(k => this.entries.get(k)).filter((e): e is PoolEntry => Boolean(e))
    await Promise.allSettled(targets.map(e => e.transport.disconnect()))
    for (const entry of targets) {
      entry.status = 'offline'
      entry.message = ''
      entry.account = { ...entry.account, password: '', ha1: undefined }
    }
    this.activeCallKey = null
  }

  async removeAccount(key: string): Promise<boolean> {
    if (this.activeCallKey === key) {
      this.onEvent({ type: 'message', message: '该号码正在通话中，请先结束通话再移除。' })
      return false
    }
    const entry = this.entries.get(key)
    if (!entry) return true
    await entry.transport.disconnect().catch(() => {})
    this.entries.delete(key)
    this.order = this.order.filter(item => item !== key)
    if (this.defaultKey === key) {
      this.defaultKey = this.order[0] ?? ''
    }
    this.persistSipAccounts()
    this.emitAggregateConnection()
    this.emitSnapshot()
    return true
  }

  setDefaultAccount(key: string) {
    if (!this.entries.has(key)) return
    this.defaultKey = key
    this.persistSipAccounts()
    this.emitSnapshot()
  }

  updateAccountMeta(key: string, meta: { label?: string; group?: string }) {
    const entry = this.entries.get(key)
    if (!entry) return
    const nextLabel = meta.label !== undefined ? (meta.label.trim() || undefined) : entry.account.label
    const nextGroup = meta.group !== undefined
      ? (meta.group.trim() ? normalizeAccountGroup(meta.group) : undefined)
      : entry.account.group
    entry.account = {
      ...entry.account,
      label: nextLabel,
      group: nextGroup,
    }
    this.persistSipAccounts()
    this.emitSnapshot()
  }

  private activeTransport(): Transport | null {
    if (this.mode === 'demo') return this.demoEntry?.transport ?? null
    if (this.activeCallKey) {
      return this.entries.get(this.activeCallKey)?.transport ?? null
    }
    return this.entries.get(this.defaultKey)?.transport ?? null
  }

  async dial(number: string, targetKey?: string) {
    if (this.activeCallKey) return
    const normalized = normalizeNumber(number)
    if (this.mode === 'demo') {
      if (this.demoEntry?.status !== 'registered') return
      await this.demoEntry.transport.dial(normalized)
      return
    }
    const key = targetKey && this.entries.has(targetKey) ? targetKey : this.defaultKey
    let entry = key ? this.entries.get(key) : undefined
    if (!entry || entry.status !== 'registered') {
      entry = this.order.map(k => this.entries.get(k)).find(e => e?.status === 'registered')
    }
    if (!entry) {
      this.onEvent({ type: 'message', message: '当前没有已注册的 SIP 号码可用于呼出。' })
      return
    }
    await entry.transport.dial(normalized, { ownNumber: accountDisplayNumber(entry.account) })
  }

  async answer() {
    await this.activeTransport()?.answer()
  }

  async hangup() {
    await this.activeTransport()?.hangup()
  }

  mute(muted: boolean) {
    this.activeTransport()?.mute(muted)
  }

  async setHold(held: boolean) {
    await this.activeTransport()?.setHold?.(held)
  }

  async sendDtmf(digit: string) {
    await this.activeTransport()?.sendDtmf?.(digit)
  }

  incoming() {
    if (this.mode === 'demo') {
      this.demoEntry?.transport.incoming?.()
    }
  }
}

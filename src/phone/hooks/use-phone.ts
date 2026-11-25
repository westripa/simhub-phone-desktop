import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { loadAccounts } from '../profile'
import { DemoPhone } from '../sip/demo'
import { AccountPool, type AccountSlot, type PoolSnapshot } from '../sip/pool'
import {
  accountKey,
  emptyAccount,
  initialState,
  mediaFailure,
  reducePhone,
  type Account,
  type Transport,
} from '../types'

export function usePhone() {
  const [state, emit] = useReducer(reducePhone, initialState)
  const [snapshot, setSnapshot] = useState<PoolSnapshot>(() => {
    const saved = loadAccounts()
    if (!saved.accounts.length) {
      return { mode: 'demo', accounts: [], defaultKey: '' }
    }
    return {
      mode: 'sip',
      defaultKey: saved.activeKey,
      accounts: saved.accounts.map(account => ({
        key: accountKey(account),
        account,
        status: 'offline',
        message: '',
      })),
    }
  })
  const audio = useRef<HTMLAudioElement>(null)
  const inputDevice = useRef('')
  const poolRef = useRef<AccountPool | null>(null)
  const sipModuleRef = useRef<typeof import('../sip/sip') | null>(null)

  if (!poolRef.current) {
    poolRef.current = new AccountPool(emit, setSnapshot, {
      createSip: (slotEmit, isBusy) => {
        if (sipModuleRef.current) {
          return new sipModuleRef.current.SipPhone(slotEmit, audio.current!, () => inputDevice.current, isBusy)
        }
        // Fallback lazy wrapper if createSip is invoked synchronously before prefetch resolves.
        let real: Transport | null = null
        let closed = false
        return {
          async connect(acc) {
            const mod = await import('../sip/sip')
            sipModuleRef.current = mod
            if (closed || !audio.current) return
            real = new mod.SipPhone(slotEmit, audio.current, () => inputDevice.current, isBusy)
            await real.connect(acc)
          },
          async disconnect() { closed = true; await real?.disconnect() },
          async dial(number, meta) { await real?.dial(number, meta) },
          async answer() { await real?.answer() },
          async hangup() { await real?.hangup() },
          mute(muted) { real?.mute(muted) },
          async sendDtmf(digit) { await real?.sendDtmf?.(digit) },
          async setHold(held) { await real?.setHold?.(held) },
        }
      },
      createDemo: slotEmit => new DemoPhone(slotEmit),
    })
  }

  useEffect(() => {
    const pool = poolRef.current!
    const initial = pool.hydrateSaved(loadAccounts())
    void import('../sip/sip').then(mod => { sipModuleRef.current = mod }).catch(() => {})
    if (initial.mode === 'demo') {
      void pool.connectDemo()
    }
    return () => {
      void pool.disconnectAll()
    }
  }, [])

  const connectBatch = useCallback(async (accounts: Account[], selectKey?: string) => {
    if (!sipModuleRef.current) {
      sipModuleRef.current = await import('../sip/sip')
    }
    await poolRef.current!.upsertAndConnect(accounts, selectKey)
  }, [])

  const connect = useCallback(async (profile: Account) => {
    if (profile.mode === 'demo') {
      await poolRef.current!.connectDemo()
      return
    }
    await connectBatch([profile])
  }, [connectBatch])

  const configure = useCallback(async (profile: Account) => {
    if (profile.mode === 'demo') return
    await poolRef.current!.configureAccount(profile)
    emit({ type: 'message', message: '账号已保存到本地列表，尚未连接。' })
  }, [])

  const disconnect = useCallback(async () => {
    await poolRef.current!.disconnectAll()
  }, [])

  const connectAccount = useCallback(async (key: string) => {
    if (!sipModuleRef.current) {
      sipModuleRef.current = await import('../sip/sip')
    }
    await poolRef.current!.connectAccount(key)
  }, [])

  const disconnectAccount = useCallback(async (key: string) => {
    await poolRef.current!.disconnectAccount(key)
  }, [])

  const removeAccount = useCallback(async (key: string) => {
    await poolRef.current!.removeAccount(key)
  }, [])

  const selectDefaultAccount = useCallback((key: string) => {
    poolRef.current!.setDefaultAccount(key)
  }, [])

  const updateAccountMeta = useCallback((key: string, meta: { label?: string; group?: string }) => {
    poolRef.current!.updateAccountMeta(key, meta)
  }, [])

  const dial = useCallback(async (value: string, targetKey?: string) => {
    if (state.connection !== 'registered' || state.call) return
    try {
      await poolRef.current!.dial(value, targetKey)
    } catch (error) {
      emit({ type: 'message', message: error instanceof Error ? error.message : mediaFailure(error) })
    }
  }, [state.connection, state.call])

  const act = useCallback(async (action: 'answer' | 'hangup') => {
    try {
      await poolRef.current![action]()
    } catch (error) {
      emit({ type: 'message', message: mediaFailure(error) })
    }
  }, [])

  const toggleHold = useCallback(async () => {
    try {
      await poolRef.current!.setHold(!state.held)
    } catch (error) {
      emit({ type: 'message', message: mediaFailure(error) })
    }
  }, [state.held])

  const sendDtmf = useCallback(async (digit: string) => {
    try {
      await poolRef.current!.sendDtmf(digit)
    } catch (error) {
      emit({ type: 'message', message: error instanceof Error ? error.message : mediaFailure(error) })
    }
  }, [])

  const defaultSlot: AccountSlot | undefined = snapshot.accounts.find(a => a.key === snapshot.defaultKey) ?? snapshot.accounts[0]
  const account: Account = snapshot.mode === 'demo' ? emptyAccount : (defaultSlot?.account ?? { ...emptyAccount, mode: 'sip' })

  return {
    state,
    account,
    accounts: snapshot.accounts,
    defaultAccountKey: snapshot.defaultKey,
    audio,
    inputDevice,
    connect,
    connectBatch,
    configure,
    disconnect,
    connectAccount,
    disconnectAccount,
    removeAccount,
    selectDefaultAccount,
    updateAccountMeta,
    dial,
    answer: () => act('answer'),
    hangup: () => act('hangup'),
    mute: () => poolRef.current!.mute(!state.muted),
    toggleHold,
    sendDtmf,
    incoming: () => poolRef.current!.incoming(),
    clearHistory: () => emit({ type: 'clear-history' }),
    notice: (message: string) => emit({ type: 'message', message }),
  }
}

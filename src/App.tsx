import { useEffect, useState } from 'react'
import { AccountDialog } from '@/components/account-dialog'
import { AudioDialog } from '@/components/audio-dialog'
import { CloseDialog } from '@/components/close-dialog'
import { UpdateDialog } from '@/components/update-dialog'
import { NumbersView } from '@/components/numbers/numbers-view'
import { ActiveCall } from '@/components/phone/active-call'
import { DialerView } from '@/components/phone/dialer-view'
import { HistoryView } from '@/components/phone/history-view'
import { PhoneNotice } from '@/components/phone/phone-notice'
import { RecentCalls } from '@/components/phone/recent-calls'
import { ActivityBar } from '@/components/workbench/activity-bar'
import { StatusBar } from '@/components/workbench/status-bar'
import { Titlebar } from '@/components/workbench/titlebar'
import type { View } from '@/components/workbench/view'
import { useAppUpdater } from '@/phone/hooks/use-app-updater'
import { useCallSounds } from '@/phone/hooks/use-call-sounds'
import { useCloseGuard } from '@/phone/hooks/use-close-guard'
import { useDesktopAlert } from '@/phone/hooks/use-desktop-alert'
import { useDevices } from '@/phone/hooks/use-devices'
import { usePhone } from '@/phone/hooks/use-phone'
import { usePhoneShortcuts } from '@/phone/hooks/use-phone-shortcuts'
import { useTheme } from '@/phone/hooks/use-theme'
import { emptyAccount, hasAccountCredential } from '@/phone/types'
import { runViewTransition } from '@/phone/view-transition'

export default function App() {
  const phone = usePhone()
  const { state, account } = phone
  const call = state.call
  const [number, setNumber] = useState('')
  const [view, setView] = useState<View>('dial')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [audioOpen, setAudioOpen] = useState(false)
  const [updateOpen, setUpdateOpen] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const devices = useDevices(phone.audio, phone.inputDevice, phone.notice)
  const sounds = useCallSounds(state, devices.selectedOutput, phone.notice)
  const keepInTray = account.mode === 'sip' && (state.connection === 'registered' || state.connection === 'connecting')
  const closeGuard = useCloseGuard(state, phone.disconnect, phone.hangup, phone.notice, keepInTray)
  const updater = useAppUpdater({
    inCall: !!call,
    beforeRelaunch: async () => { await phone.disconnect().catch(() => {}) },
  })
  const ready = state.connection === 'registered' && !closeGuard.busy
  const accountBusy = !!call || closeGuard.busy || state.connection === 'connecting'
  const demo = account.mode === 'demo'
  const lastNumber = state.history[0]?.peer
  const missedCount = state.history.filter(item => ['missed', 'failed', 'unknown'].includes(item.outcome)).length
  const onlineCount = phone.accounts.filter(slot => slot.status === 'registered').length

  function switchView(next: View) {
    if (next === view) return
    runViewTransition(() => setView(next), 'view')
  }

  useEffect(() => {
    if (call) setView('dial')
  }, [call?.id])

  useDesktopAlert({ call, latestHistory: state.history[0], connected: ready })

  function dial() {
    if (state.message) phone.notice('')
    if (view !== 'dial') switchView('dial')
    if (!number.trim() && lastNumber) {
      setNumber(lastNumber)
      return
    }
    void phone.dial(number)
  }

  function dialNumber(peer: string) {
    if (state.message) phone.notice('')
    setNumber(peer)
    if (view !== 'dial') switchView('dial')
    void phone.dial(peer)
  }

  function handleNumberChange(next: string) {
    if (state.message) phone.notice('')
    setNumber(next)
  }

  function selectNumber(peer: string) {
    setNumber(peer)
    if (view !== 'dial') switchView('dial')
  }

  usePhoneShortcuts({
    blocked: settingsOpen || audioOpen || updateOpen || !!closeGuard.dialog || closeGuard.busy,
    call,
    onDial: dial,
    onAnswer: () => { void phone.answer() },
    onHangup: () => { void phone.hangup() },
    onDigit: digit => {
      if (state.message) phone.notice('')
      if (view !== 'dial') switchView('dial')
      sounds.keySound(digit)
      setNumber(previous => (previous + digit).slice(0, 20))
    },
    onDtmf: digit => {
      sounds.keySound(digit)
      void phone.sendDtmf(digit)
    },
    onMute: phone.mute,
    onHold: () => { void phone.toggleHold() },
    onErase: () => {
      if (view !== 'dial') switchView('dial')
      setNumber(previous => previous.slice(0, -1))
    },
  })

  function toggleConnection() {
    if (ready) void phone.disconnect()
    else if (hasAccountCredential(account)) void phone.connect(account)
    else setSettingsOpen(true)
  }

  function resumeAudio() {
    void phone.audio.current?.play()
      .then(() => phone.notice(''))
      .catch(() => phone.notice('仍无法播放声音，请检查系统声音权限。'))
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <a
        href="#workbench-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-12 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-panel focus:px-3 focus:py-2 focus:text-xs focus:shadow-sm"
      >
        跳到主要内容
      </a>

      <Titlebar
        account={account}
        accounts={phone.accounts}
        connection={state.connection}
        call={call}
        busy={accountBusy}
        theme={theme}
        onToggleTheme={toggleTheme}
        onToggleConnection={toggleConnection}
        onManageNumbers={() => switchView('numbers')}
      />

      <div className="flex min-h-0 flex-1">
        <ActivityBar
          view={view}
          connection={state.connection}
          accountBusy={accountBusy}
          missedCount={missedCount}
          numberCount={phone.accounts.length}
          onlineCount={onlineCount}
          isDemo={demo}
          updateAvailable={!!updater.state.availableVersion}
          onViewChange={switchView}
          onAudioSettings={() => setAudioOpen(true)}
          onAccountSettings={() => setSettingsOpen(true)}
          onCheckUpdates={() => {
            setUpdateOpen(true)
            if (!updater.state.availableVersion) {
              void updater.checkForUpdates(true)
            }
          }}
        />

        {view === 'dial' && !call && (
          <RecentCalls
            history={state.history}
            inCall={!!call}
            demo={demo}
            ready={ready}
            onSelect={selectNumber}
            onDialNumber={dialNumber}
            onClear={phone.clearHistory}
            onIncoming={phone.incoming}
            onViewHistory={() => switchView('history')}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {(view !== 'dial' || !!call) && (
            <PhoneNotice
              message={state.message}
              onDismiss={() => phone.notice('')}
              onResumeAudio={call?.phase === 'connected' && !demo ? resumeAudio : undefined}
            />
          )}

          <main id="workbench-main" tabIndex={-1} className="@container/main vt-main workbench-stage min-h-0 flex-1 outline-none">
            {view === 'dial' ? (
              call ? (
                <ActiveCall
                  call={call}
                  muted={state.muted}
                  held={state.held}
                  demo={demo}
                  onAnswer={phone.answer}
                  onHangup={phone.hangup}
                  onMute={phone.mute}
                  onToggleHold={() => { void phone.toggleHold() }}
                  onSendDtmf={digit => { void phone.sendDtmf(digit) }}
                  onKeySound={sounds.keySound}
                  onTestSound={devices.testSpeaker}
                />
              ) : (
                <DialerView
                  account={account}
                  accounts={phone.accounts}
                  defaultAccountKey={phone.defaultAccountKey}
                  connection={state.connection}
                  number={number}
                  lastNumber={lastNumber}
                  ready={ready}
                  busy={accountBusy}
                  onNumberChange={handleNumberChange}
                  onDial={dial}
                  onKeySound={sounds.keySound}
                  onConnect={toggleConnection}
                  onSettings={() => setSettingsOpen(true)}
                  onSelectDefault={phone.selectDefaultAccount}
                  onConnectKey={key => {
                    void phone.connectAccount(key).catch(err => phone.notice(err instanceof Error ? err.message : '无法连接该号码。'))
                  }}
                  onOpenNumbers={() => switchView('numbers')}
                  onIncoming={phone.incoming}
                  onOpenAudio={() => setAudioOpen(true)}
                  noticeMessage={state.message}
                  onDismissNotice={() => phone.notice('')}
                />
              )
            ) : view === 'numbers' ? (
              <NumbersView
                account={account}
                accounts={phone.accounts}
                defaultAccountKey={phone.defaultAccountKey}
                busyCallKey={call?.accountKey}
                onBindBatch={batch => phone.connectBatch(batch)}
                onSaveAccount={profile => phone.configure(profile)}
                onConnectKey={key => {
                  void phone.connectAccount(key).catch(err => phone.notice(err instanceof Error ? err.message : '无法连接该号码。'))
                }}
                onDisconnectKey={key => { void phone.disconnectAccount(key) }}
                onRemoveKey={key => { void phone.removeAccount(key) }}
                onSelectDefault={phone.selectDefaultAccount}
                onDialWithAccount={key => {
                  phone.selectDefaultAccount(key)
                  switchView('dial')
                }}
                onUpdateMeta={phone.updateAccountMeta}
                onSwitchToDemo={() => {
                  void phone.connect({ ...emptyAccount, mode: 'demo' }).catch(() => {
                    phone.notice('切换演示模式失败，请稍后重试。')
                  })
                }}
              />
            ) : (
              <HistoryView
                history={state.history}
                inCall={!!call}
                demo={demo}
                ready={ready}
                onSelect={selectNumber}
                onDialNumber={dialNumber}
                onClear={phone.clearHistory}
                onIncoming={phone.incoming}
              />
            )}
          </main>
        </div>
      </div>

      <StatusBar
        account={account}
        accounts={phone.accounts}
        connection={state.connection}
        call={call}
        held={state.held}
        view={view}
        appVersion={updater.state.currentVersion}
        availableVersion={updater.state.availableVersion}
        onOpenUpdate={() => setUpdateOpen(true)}
      />

      <AccountDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        account={account}
        accounts={phone.accounts}
        defaultAccountKey={phone.defaultAccountKey}
        busyCallKey={call?.accountKey}
        onConnect={profile => { void phone.connect(profile).catch(() => phone.notice('账号设置无效，请检查后重新连接。')) }}
        onConnectBatch={batch => { void phone.connectBatch(batch).catch(() => phone.notice('批量导入连接失败，请检查账号设置。')) }}
        onSave={profile => { void phone.configure(profile).catch(() => phone.notice('无法应用账号设置，请重试。')) }}
        onConnectKey={key => { void phone.connectAccount(key).catch(err => phone.notice(err instanceof Error ? err.message : '无法连接该号码。')) }}
        onDisconnectKey={key => { void phone.disconnectAccount(key) }}
        onRemoveKey={key => { void phone.removeAccount(key) }}
        onSelectDefault={phone.selectDefaultAccount}
        onOpenNumbers={() => {
          setSettingsOpen(false)
          switchView('numbers')
        }}
      />
      <AudioDialog open={audioOpen} onOpenChange={setAudioOpen} devices={devices} sounds={sounds} inCall={!!call} />
      <UpdateDialog
        open={updateOpen}
        onOpenChange={setUpdateOpen}
        state={updater.state}
        inCall={!!call}
        releasesUrl={updater.releasesUrl}
        onCheck={() => { void updater.checkForUpdates(true) }}
        onInstall={() => { void updater.installUpdate() }}
      />
      <CloseDialog mode={closeGuard.dialog} ending={call?.phase === 'ending'} dismiss={closeGuard.dismiss} endAndExit={closeGuard.endAndExit} forceExit={closeGuard.forceExit} />
      <audio ref={phone.audio} autoPlay playsInline hidden />
    </div>
  )
}

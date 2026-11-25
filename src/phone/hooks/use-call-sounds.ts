import { useEffect, useRef, useState } from 'react'
import {
  clearCustomRingtone,
  loadCustomRingtone,
  loadSavedRingtoneMode,
  saveCustomRingtone,
  saveRingtoneMode,
  type CustomRingtoneRecord,
  type CustomRingtoneState,
} from '../audio/ringtone-clip'
import { playAudioUrl, playKeyTone, playSound } from '../audio/sounds'
import type { PhoneState } from '../types'

export type RingtoneMode = 'classic' | 'soft' | 'custom' | 'off'

export function useCallSounds(state: PhoneState, output: string, notice: (message: string) => void) {
  const [ringtone, setRingtoneState] = useState<RingtoneMode>(loadSavedRingtoneMode)
  const [customRingtone, setCustomRingtone] = useState<CustomRingtoneState | null>(null)
  const [ringVolume, setRingVolume] = useState(85)
  const [effects, setEffects] = useState(true)
  const playing = useRef<ReturnType<typeof playSound> | null>(null)
  const preview = useRef<ReturnType<typeof playSound> | null>(null)
  const effect = useRef<ReturnType<typeof playSound> | null>(null)
  const customUrlRef = useRef<string | null>(null)
  const lastEnd = useRef(state.history[0]?.id)
  const latest = useRef({ notice, ringVolume, effects, output })
  latest.current = { notice, ringVolume, effects, output }
  const id = state.call?.id
  const phase = state.call?.phase
  const direction = state.call?.direction

  function setRingtone(mode: RingtoneMode) {
    setRingtoneState(mode)
    saveRingtoneMode(mode)
  }

  useEffect(() => {
    let active = true
    void loadCustomRingtone().then(record => {
      if (!active || !record) return
      const url = URL.createObjectURL(record.blob)
      if (customUrlRef.current) URL.revokeObjectURL(customUrlRef.current)
      customUrlRef.current = url
      setCustomRingtone({
        url,
        name: record.name,
        startSec: record.startSec,
        durationSec: record.durationSec,
      })
    })
    return () => {
      active = false
      if (customUrlRef.current) {
        URL.revokeObjectURL(customUrlRef.current)
        customUrlRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const incoming = phase === 'incoming'
    const outgoing = direction === 'outgoing' && (phase === 'dialing' || phase === 'ringing') && effects
    if (!incoming && !outgoing) return
    if (incoming && ringtone === 'off') return

    // A new call always replaces a ringtone preview or a keypad effect.
    preview.current?.stop(); effect.current?.stop()
    const onFail = () => latest.current.notice('提示音未能播放，请在声音设置中试听并检查系统音量。')
    const sound = incoming
      ? (ringtone === 'custom' && customRingtone?.url
          ? playAudioUrl(customRingtone.url, latest.current.ringVolume, output, true, onFail, false)
          : playSound(ringtone === 'classic' ? 'classic' : 'soft', latest.current.ringVolume, output, true, onFail))
      : playSound('ringback', latest.current.ringVolume, output, true, onFail)

    playing.current = sound
    return () => { sound.stop(); if (playing.current === sound) playing.current = null }
  }, [id, phase, direction, ringtone, customRingtone?.url, effects, output])

  useEffect(() => {
    if (playing.current) playing.current.audio.volume = ringVolume / 100
    if (preview.current) preview.current.audio.volume = ringVolume / 100
  }, [ringVolume])

  useEffect(() => {
    const ended = state.history[0]
    if (!ended || ended.id === lastEnd.current) return
    lastEnd.current = ended.id
    if (!latest.current.effects) return
    effect.current?.stop()
    effect.current = playSound('end', latest.current.ringVolume, latest.current.output, false, () => {})
  }, [state.history])

  useEffect(() => () => { playing.current?.stop(); preview.current?.stop(); effect.current?.stop() }, [])

  function audition() {
    preview.current?.stop()
    if (ringtone === 'off') return
    const onFail = () => notice('铃声未能播放，请检查系统声音权限。')
    if (ringtone === 'custom' && customRingtone?.url) {
      preview.current = playAudioUrl(customRingtone.url, ringVolume, output, false, onFail, false)
      return
    }
    preview.current = playSound(ringtone === 'classic' ? 'classic' : 'soft', ringVolume, output, false, onFail)
  }

  async function saveClipRingtone(record: Omit<CustomRingtoneRecord, 'updatedAt'>) {
    preview.current?.stop()
    const fullRecord: CustomRingtoneRecord = { ...record, updatedAt: Date.now() }
    await saveCustomRingtone(fullRecord)
    const url = URL.createObjectURL(record.blob)
    if (customUrlRef.current) URL.revokeObjectURL(customUrlRef.current)
    customUrlRef.current = url
    setCustomRingtone({
      url,
      name: record.name,
      startSec: record.startSec,
      durationSec: record.durationSec,
    })
    setRingtone('custom')
  }

  async function removeCustomRingtone() {
    preview.current?.stop()
    await clearCustomRingtone()
    if (customUrlRef.current) {
      URL.revokeObjectURL(customUrlRef.current)
      customUrlRef.current = null
    }
    setCustomRingtone(null)
    if (ringtone === 'custom') setRingtone('soft')
  }

  function keySound(digit?: string) {
    if (!effects || state.call) return
    playKeyTone(digit, ringVolume, output)
  }

  return {
    ringtone,
    setRingtone,
    customRingtone,
    saveClipRingtone,
    removeCustomRingtone,
    ringVolume,
    setRingVolume,
    effects,
    setEffects,
    audition,
    stopPreview: () => preview.current?.stop(),
    keySound,
  }
}

import { useEffect, useRef, useState, type RefObject } from 'react'
import { audioDeviceOptions } from '../audio/devices'
import { playSound } from '../audio/sounds'

type SinkAudio = HTMLAudioElement & { setSinkId?: (deviceId: string) => Promise<void> }

export function useDevices(audio: RefObject<HTMLAudioElement | null>, input: RefObject<string>, notice: (message: string) => void) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedInput, setSelectedInput] = useState('')
  const [selectedOutput, setSelectedOutput] = useState('')
  const [volume, setVolume] = useState(80)
  const [outputSupported, setOutputSupported] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const stopTestSound = useRef<(() => void) | null>(null)
  const noticeRef = useRef(notice)
  noticeRef.current = notice

  async function refresh(requestAccess = false) {
    if (!navigator.mediaDevices) { noticeRef.current('当前环境无法访问音频设备，请使用本机页面或受信任的 HTTPS。'); return }
    setRefreshing(true)
    try {
      if (requestAccess) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        stream.getTracks().forEach(track => track.stop())
      }
      setDevices(await navigator.mediaDevices.enumerateDevices())
    } catch { if (requestAccess) noticeRef.current('无法读取音频设备，请检查麦克风权限。') }
    finally { setRefreshing(false) }
  }
  useEffect(() => {
    setOutputSupported(!!(audio.current as SinkAudio | null)?.setSinkId)
    void refresh()
    const changed = () => { void refresh() }
    navigator.mediaDevices?.addEventListener('devicechange', changed)
    return () => navigator.mediaDevices?.removeEventListener('devicechange', changed)
  }, [])
  useEffect(() => { if (audio.current) audio.current.volume = volume / 100 }, [volume, audio])
  useEffect(() => () => { stopTestSound.current?.() }, [])
  useEffect(() => {
    if (selectedInput && !devices.some(device => device.kind === 'audioinput' && device.deviceId === selectedInput)) {
      input.current = ''
      setSelectedInput('')
      noticeRef.current('所选麦克风已断开，下次通话使用系统默认设备。')
    }
    if (selectedOutput && !devices.some(device => device.kind === 'audiooutput' && device.deviceId === selectedOutput)) {
      void (audio.current as SinkAudio | null)?.setSinkId?.('').catch(() => {})
      setSelectedOutput('')
      noticeRef.current('所选扬声器已断开，已切回系统默认输出。')
    }
  }, [devices, selectedInput, selectedOutput, input, audio])

  function chooseInput(value: string) { input.current = value; setSelectedInput(value) }
  async function chooseOutput(value: string) {
    try { await (audio.current as SinkAudio | null)?.setSinkId?.(value); setSelectedOutput(value) }
    catch { noticeRef.current('无法切换输出设备，请检查设备是否可用。') }
  }
  function testSpeaker() {
    stopTestSound.current?.()
    const sound = playSound('preview', volume, selectedOutput, false, () => noticeRef.current('无法播放测试音，请检查输出设备或声音权限。'))
    stopTestSound.current = sound.stop
  }
  return { inputs: audioDeviceOptions(devices, 'audioinput'), outputs: audioDeviceOptions(devices, 'audiooutput'), selectedInput, selectedOutput, chooseInput, chooseOutput, volume, setVolume, outputSupported, refreshing, refresh, testSpeaker, stopTest: () => stopTestSound.current?.() }
}

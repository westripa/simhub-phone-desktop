export type Sound = 'classic' | 'soft' | 'ringback' | 'end' | 'key' | 'preview'

const modernKeyHz: Record<string, number> = {
  '1': 523.25,
  '2': 587.33,
  '3': 659.25,
  '4': 698.46,
  '5': 783.99,
  '6': 880.00,
  '7': 987.77,
  '8': 1046.50,
  '9': 1174.66,
  '*': 440.00,
  '0': 493.88,
  '+': 493.88,
  '#': 1318.51,
}

// Original, locally synthesized PCM: no downloaded recordings or remote URLs.
export function soundURL(kind: Sound, digit?: string): string {
  const rate = 16000
  const duration = { classic: 3, soft: 3, ringback: 3.2, end: 0.28, key: 0.11, preview: 0.5 }[kind]
  const samples = Math.floor(rate * duration)
  const buffer = new ArrayBuffer(44 + samples * 2)
  const view = new DataView(buffer)
  const text = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  text(36, 'data'); view.setUint32(40, samples * 2, true)
  const keyHz = (digit && modernKeyHz[digit]) || 659.25
  for (let index = 0; index < samples; index++) {
    const t = index / rate
    let signal = 0
    const sine = (hz: number) => Math.sin(2 * Math.PI * hz * t)
    const envelope = (start: number, length: number) => t < start || t >= start + length ? 0 : Math.min(1, (t - start) / 0.008, (start + length - t) / 0.025)
    if (kind === 'classic') signal = (sine(660) + sine(880)) * (envelope(0, 0.35) + envelope(0.55, 0.35)) * 0.25
    else if (kind === 'soft') signal = (sine(523.25) * envelope(0, 0.22) + sine(659.25) * envelope(0.25, 0.22) + sine(783.99) * envelope(0.5, 0.45)) * Math.exp(-t * 0.8) * 0.35
    else if (kind === 'ringback') signal = (sine(440) + 0.5 * sine(880)) * envelope(0.05, 0.9) * Math.exp(-(t % 3.2) * 1.2) * 0.26
    else if (kind === 'end') signal = (sine(587.33) * envelope(0, 0.09) + sine(440) * envelope(0.11, 0.14)) * Math.exp(-t * 4) * 0.32
    else if (kind === 'key') {
      const attack = 1 - Math.exp(-t * 480)
      const body = sine(keyHz) * Math.exp(-t * 28)
      const overtone = 0.24 * sine(keyHz * 2) * Math.exp(-t * 55)
      const click = 0.08 * sine(keyHz * 3.2) * Math.exp(-t * 160)
      signal = (body + overtone + click) * attack * 0.38
    } else signal = (sine(523.25) * envelope(0, 0.2) + sine(659.25) * envelope(0.22, 0.25)) * 0.32
    view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, signal)) * 32767, true)
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
}

export function playAudioUrl(url: string, volume: number, output: string, loop: boolean, failed: () => void, revokeOnStop = false) {
  const audio = new Audio(url)
  audio.volume = volume / 100
  audio.loop = loop
  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    if (revokeOnStop) URL.revokeObjectURL(url)
  }
  audio.onended = stop
  audio.onerror = () => { if (!stopped) { stop(); failed() } }
  void (async () => {
    if (output && audio.setSinkId) await audio.setSinkId(output)
    if (!stopped) await audio.play()
  })().catch(() => { if (!stopped) { stop(); failed() } })
  return { audio, stop }
}

export function playSound(kind: Sound, volume: number, output: string, loop: boolean, failed: () => void, digit?: string) {
  const url = soundURL(kind, digit)
  return playAudioUrl(url, volume, output, loop, failed, true)
}

type SinkAudioContext = AudioContext & { setSinkId?: (sinkId: string) => Promise<void> }

let keyCtx: SinkAudioContext | null = null
let keySink = ''

export function playKeyTone(digit: string | undefined, volume: number, output: string) {
  if (volume <= 0 || typeof window === 'undefined') return
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return
  if (!keyCtx || keyCtx.state === 'closed') {
    keyCtx = new Ctx({ latencyHint: 'interactive' }) as SinkAudioContext
    keySink = ''
  }
  const ctx = keyCtx
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  if (output !== keySink && typeof ctx.setSinkId === 'function') {
    keySink = output
    void ctx.setSinkId(output).catch(() => {})
  }

  const hz = (digit && modernKeyHz[digit]) || 659.25
  const now = ctx.currentTime
  const peak = Math.min(0.95, Math.max(0.001, (volume / 100) * 0.72))

  const master = ctx.createGain()
  master.gain.setValueAtTime(0.0001, now)
  master.gain.linearRampToValueAtTime(peak, now + 0.003)
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.13)
  master.connect(ctx.destination)

  const body = ctx.createOscillator()
  body.type = 'sine'
  body.frequency.setValueAtTime(hz, now)
  body.connect(master)

  const overtoneGain = ctx.createGain()
  overtoneGain.gain.setValueAtTime(0.38, now)
  overtoneGain.gain.exponentialRampToValueAtTime(0.01, now + 0.065)
  overtoneGain.connect(master)

  const overtone = ctx.createOscillator()
  overtone.type = 'triangle'
  overtone.frequency.setValueAtTime(hz * 2, now)
  overtone.connect(overtoneGain)

  body.start(now)
  overtone.start(now)
  body.stop(now + 0.135)
  overtone.stop(now + 0.07)
  body.onended = () => {
    body.disconnect()
    overtone.disconnect()
    overtoneGain.disconnect()
    master.disconnect()
  }
}

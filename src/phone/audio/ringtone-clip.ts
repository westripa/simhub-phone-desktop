export const MAX_RINGTONE_SECONDS = 30
export const MIN_RINGTONE_SECONDS = 3

export interface DecodedTrack {
  buffer: AudioBuffer
  duration: number
  peaks: number[]
  fileName: string
}

export interface CustomRingtoneRecord {
  blob: Blob
  name: string
  startSec: number
  durationSec: number
  updatedAt: number
}

export interface CustomRingtoneState {
  url: string
  name: string
  startSec: number
  durationSec: number
}

const DB_NAME = 'simhub_phone_media_v1'
const STORE_NAME = 'ringtones'
const RECORD_KEY = 'custom_incoming_ringtone'
const MODE_KEY = 'simhub.phone.ringtoneMode.v1'

let memoryRecord: CustomRingtoneRecord | null = null

export function loadSavedRingtoneMode(): 'soft' | 'classic' | 'custom' | 'off' {
  try {
    const val = globalThis.localStorage?.getItem(MODE_KEY)
    if (val === 'soft' || val === 'classic' || val === 'custom' || val === 'off') return val
  } catch {
    // Ignore storage errors
  }
  return 'soft'
}

export function saveRingtoneMode(mode: 'soft' | 'classic' | 'custom' | 'off'): void {
  try {
    globalThis.localStorage?.setItem(MODE_KEY, mode)
  } catch {
    // Ignore storage errors
  }
}

export function extractWaveformPeaks(buffer: AudioBuffer, bars = 96): number[] {
  const channel = buffer.getChannelData(0)
  const total = channel.length
  if (total === 0 || bars <= 0) return Array.from({ length: Math.max(1, bars) }, () => 0.1)
  const blockSize = Math.max(1, Math.floor(total / bars))
  const raw: number[] = []
  let maxPeak = 0.001

  for (let i = 0; i < bars; i++) {
    const start = i * blockSize
    const end = Math.min(total, start + blockSize)
    const step = Math.max(1, Math.floor((end - start) / 64))
    let sum = 0
    let count = 0
    for (let j = start; j < end; j += step) {
      const sample = Math.abs(channel[j])
      sum += sample * sample
      count++
    }
    const rms = count > 0 ? Math.sqrt(sum / count) : 0
    raw.push(rms)
    if (rms > maxPeak) maxPeak = rms
  }

  return raw.map(v => Math.max(0.08, Math.min(1, v / maxPeak)))
}

export async function decodeAudioFile(file: File): Promise<DecodedTrack> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) throw new Error('当前环境不支持 Web Audio 音频解码。')
  const arrayBuffer = await file.arrayBuffer()
  const ctx = new Ctx()
  try {
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
    if (!buffer || buffer.duration < 0.5) {
      throw new Error('音频时长过短，请选择至少 1 秒以上的音乐文件。')
    }
    return {
      buffer,
      duration: buffer.duration,
      peaks: extractWaveformPeaks(buffer, 96),
      fileName: file.name.replace(/\.[^.]+$/, '') || '自定义铃声',
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('音频时长')) throw err
    throw new Error('无法解码该音频文件，请选择 MP3、FLAC、WAV、M4A/AAC 或 OGG 格式。')
  } finally {
    void ctx.close().catch(() => {})
  }
}

export function clampClipRange(totalDuration: number, startSec: number, durationSec: number): { startSec: number; durationSec: number } {
  const safeTotal = Math.max(0.5, totalDuration)
  const maxDur = Math.min(MAX_RINGTONE_SECONDS, safeTotal)
  const minDur = Math.min(MIN_RINGTONE_SECONDS, safeTotal)
  const clampedDur = Math.max(minDur, Math.min(maxDur, durationSec))
  const maxStart = Math.max(0, safeTotal - clampedDur)
  const clampedStart = Math.max(0, Math.min(maxStart, startSec))
  return {
    startSec: Math.round(clampedStart * 10) / 10,
    durationSec: Math.round(clampedDur * 10) / 10,
  }
}

export function encodeMonoPcmWav(samples: Float32Array, sampleRate: number): Blob {
  const numSamples = samples.length
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, buffer.byteLength - 8, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true)  // PCM format = 1
  view.setUint16(22, 1, true)  // Mono = 1 channel
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)  // Block align
  view.setUint16(34, 16, true) // 16-bit
  writeAscii(36, 'data')
  view.setUint32(40, numSamples * 2, true)

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 32768 : clamped * 32767, true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

/**
 * Slices `[startSec, startSec + durationSec]` (up to 30s) from an AudioBuffer
 * or multichannel Float32Array, mixes down to mono at up to 22050 Hz, applies
 * smooth 0.25s fade-in and 0.35s fade-out, and encodes as a 16-bit PCM WAV Blob.
 */
export function trimAudioBufferToWav(
  source: Pick<AudioBuffer, 'sampleRate' | 'numberOfChannels' | 'duration' | 'getChannelData'>,
  rawStartSec: number,
  rawDurationSec: number,
  targetRate = 22050,
): { blob: Blob; startSec: number; durationSec: number } {
  const { startSec, durationSec } = clampClipRange(source.duration, rawStartSec, rawDurationSec)
  const srcRate = source.sampleRate
  const outRate = Math.min(srcRate, targetRate)
  const outLength = Math.max(1, Math.floor(durationSec * outRate))
  const outSamples = new Float32Array(outLength)
  const channels = Math.max(1, source.numberOfChannels)
  const channelData: Float32Array[] = []
  for (let c = 0; c < channels; c++) {
    channelData.push(source.getChannelData(c))
  }

  let peak = 0.001
  const srcTotal = channelData[0]?.length ?? 0

  for (let i = 0; i < outLength; i++) {
    const timeSec = startSec + i / outRate
    const srcPos = timeSec * srcRate
    const idx0 = Math.min(srcTotal - 1, Math.max(0, Math.floor(srcPos)))
    const idx1 = Math.min(srcTotal - 1, idx0 + 1)
    const frac = srcPos - idx0

    let sum = 0
    for (let c = 0; c < channels; c++) {
      const ch = channelData[c]
      sum += ch[idx0] * (1 - frac) + ch[idx1] * frac
    }
    const mixed = sum / channels
    outSamples[i] = mixed
    const abs = Math.abs(mixed)
    if (abs > peak) peak = abs
  }

  const normGain = peak > 0.02 ? Math.min(2.2, 0.92 / peak) : 1
  const fadeInSamples = Math.min(Math.floor(outLength * 0.2), Math.floor(outRate * 0.25))
  const fadeOutSamples = Math.min(Math.floor(outLength * 0.2), Math.floor(outRate * 0.35))

  for (let i = 0; i < outLength; i++) {
    let env = 1
    if (fadeInSamples > 0 && i < fadeInSamples) {
      env = i / fadeInSamples
    } else if (fadeOutSamples > 0 && i >= outLength - fadeOutSamples) {
      env = (outLength - 1 - i) / fadeOutSamples
    }
    outSamples[i] = outSamples[i] * normGain * env
  }

  return {
    blob: encodeMonoPcmWav(outSamples, outRate),
    startSec,
    durationSec,
  }
}

export function previewClipBuffer(
  buffer: AudioBuffer,
  rawStartSec: number,
  rawDurationSec: number,
  volume: number,
  output: string,
  onEnded?: () => void,
): { stop: () => void } {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) {
    onEnded?.()
    return { stop: () => {} }
  }
  const { startSec, durationSec } = clampClipRange(buffer.duration, rawStartSec, rawDurationSec)
  const ctx = new Ctx() as AudioContext & { setSinkId?: (id: string) => Promise<void> }
  let stopped = false

  const source = ctx.createBufferSource()
  source.buffer = buffer

  const gain = ctx.createGain()
  const now = ctx.currentTime
  const targetGain = Math.max(0.0001, Math.min(1, volume / 100))
  const fadeIn = Math.min(0.25, durationSec * 0.15)
  const fadeOut = Math.min(0.35, durationSec * 0.2)

  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.linearRampToValueAtTime(targetGain, now + fadeIn)
  if (durationSec > fadeIn + fadeOut) {
    gain.gain.setValueAtTime(targetGain, now + durationSec - fadeOut)
  }
  gain.gain.linearRampToValueAtTime(0.0001, now + durationSec)

  source.connect(gain)
  gain.connect(ctx.destination)

  const cleanup = () => {
    if (stopped) return
    stopped = true
    try { source.stop() } catch { /* already stopped */ }
    source.disconnect()
    gain.disconnect()
    void ctx.close().catch(() => {})
    onEnded?.()
  }

  source.onended = cleanup

  void (async () => {
    if (output && typeof ctx.setSinkId === 'function') {
      await ctx.setSinkId(output).catch(() => {})
    }
    if (!stopped) source.start(0, startSec, durationSec)
  })().catch(cleanup)

  return { stop: cleanup }
}

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB 不可用'))
      return
    }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('打开音频数据库失败'))
  })
}

export async function saveCustomRingtone(record: CustomRingtoneRecord): Promise<void> {
  memoryRecord = record
  try {
    const db = await openMediaDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(record, RECORD_KEY)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error ?? new Error('保存自定义铃声失败')) }
    })
  } catch {
    // Keep memoryRecord if IndexedDB is unavailable
  }
}

export async function loadCustomRingtone(): Promise<CustomRingtoneRecord | null> {
  try {
    const db = await openMediaDb()
    const record = await new Promise<CustomRingtoneRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(RECORD_KEY)
      req.onsuccess = () => {
        db.close()
        const val = req.result as CustomRingtoneRecord | undefined
        resolve(val && val.blob instanceof Blob ? val : null)
      }
      req.onerror = () => { db.close(); reject(req.error) }
    })
    if (record) memoryRecord = record
    return record ?? memoryRecord
  } catch {
    return memoryRecord
  }
}

export async function clearCustomRingtone(): Promise<void> {
  memoryRecord = null
  try {
    const db = await openMediaDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(RECORD_KEY)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    })
  } catch {
    // Ignore errors when clearing
  }
}

export function formatClipTimestamp(seconds: number): string {
  const safe = Math.max(0, seconds)
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toFixed(1).padStart(4, '0')}`
}

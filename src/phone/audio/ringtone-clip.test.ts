import { expect, test } from 'bun:test'
import { clampClipRange, trimAudioBufferToWav } from './ringtone-clip'

test('来电铃声剪辑严格限制最长 30 秒且不越界，并导出合法 WAV 音频片段', () => {
  // 210 秒的整首歌，从 195 秒开始请求截取 45 秒 -> 应自动收敛为 [180, 30]
  const clamped = clampClipRange(210, 195, 45)
  expect(clamped.durationSec).toBe(30)
  expect(clamped.startSec).toBe(180)

  // 合成一段 40 秒、8000 Hz 的模拟双声道采样，验证裁剪出的 WAV 长度严格为 30 秒
  const sampleRate = 8000
  const duration = 40
  const totalSamples = sampleRate * duration
  const ch0 = new Float32Array(totalSamples)
  const ch1 = new Float32Array(totalSamples)
  for (let i = 0; i < totalSamples; i++) {
    const val = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5
    ch0[i] = val
    ch1[i] = val
  }

  const result = trimAudioBufferToWav(
    {
      sampleRate,
      numberOfChannels: 2,
      duration,
      getChannelData: index => (index === 0 ? ch0 : ch1),
    },
    5,
    30,
    8000,
  )

  expect(result.startSec).toBe(5)
  expect(result.durationSec).toBe(30)
  // 44 字节 WAV 头 + 30 秒 * 8000 Hz * 2 字节(16-bit) = 480044 字节
  expect(result.blob.size).toBe(44 + 30 * 8000 * 2)
  expect(result.blob.type).toBe('audio/wav')
})

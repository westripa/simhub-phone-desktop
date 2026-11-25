import { useEffect, useId, useRef, useState } from 'react'
import { BellRing, Check, Headphones, Mic, Music, Play, RefreshCw, Scissors, Square, Trash2, Upload, Volume2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardPanel } from '@/components/ui/card'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  clampClipRange,
  decodeAudioFile,
  formatClipTimestamp,
  MAX_RINGTONE_SECONDS,
  MIN_RINGTONE_SECONDS,
  previewClipBuffer,
  trimAudioBufferToWav,
  type DecodedTrack,
} from '@/phone/audio/ringtone-clip'
import type { RingtoneMode, useCallSounds } from '@/phone/hooks/use-call-sounds'
import type { useDevices } from '@/phone/hooks/use-devices'

function Choice({ label, items, value, onChange, disabled }: {
  label: string
  items: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="grid gap-2">
      <Label id={id}>{label}</Label>
      <Select items={items} value={value} onValueChange={next => { if (next !== null) onChange(next) }} disabled={disabled}>
        <SelectTrigger aria-labelledby={id}><SelectValue /></SelectTrigger>
        <SelectPopup>{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectPopup>
      </Select>
    </div>
  )
}

function Level({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="grid gap-2">
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <output className="tabular-nums text-muted-foreground">{value}%</output>
      </div>
      <Slider
        value={value}
        onValueChange={next => onChange(Array.isArray(next) ? next[0] : next)}
        min={0}
        max={100}
        getAriaLabel={() => label}
      />
    </div>
  )
}

function WaveformTrimmer({
  track,
  startSec,
  durationSec,
  onStartChange,
}: {
  track: DecodedTrack
  startSec: number
  durationSec: number
  onStartChange: (nextStart: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const endSec = Math.min(track.duration, startSec + durationSec)
  const leftPct = (startSec / track.duration) * 100
  const widthPct = Math.min(100 - leftPct, (durationSec / track.duration) * 100)

  function moveByClientX(clientX: number) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const centeredStart = ratio * track.duration - durationSec / 2
    const clamped = clampClipRange(track.duration, centeredStart, durationSec)
    onStartChange(clamped.startSec)
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>点击或拖动声波选择高潮片段</span>
        <span className="font-mono text-foreground">
          {formatClipTimestamp(startSec)} – {formatClipTimestamp(endSec)} ({durationSec.toFixed(1)}s)
        </span>
      </div>

      <div
        ref={containerRef}
        role="slider"
        tabIndex={0}
        aria-label="声波选区起始时间"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, Math.round(track.duration - durationSec))}
        aria-valuenow={Math.round(startSec)}
        onPointerDown={event => {
          draggingRef.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
          moveByClientX(event.clientX)
        }}
        onPointerMove={event => {
          if (draggingRef.current) moveByClientX(event.clientX)
        }}
        onPointerUp={event => {
          draggingRef.current = false
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
        }}
        onKeyDown={event => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            onStartChange(clampClipRange(track.duration, startSec - 1, durationSec).startSec)
          } else if (event.key === 'ArrowRight') {
            event.preventDefault()
            onStartChange(clampClipRange(track.duration, startSec + 1, durationSec).startSec)
          }
        }}
        className="relative flex h-16 cursor-ew-resize select-none items-center gap-[2px] overflow-hidden rounded-lg border border-border bg-background px-2 py-2 outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 border-x-2 border-primary bg-primary/15 transition-[left,width] duration-75"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        />
        {track.peaks.map((peak, index) => {
          const barSec = ((index + 0.5) / track.peaks.length) * track.duration
          const inRange = barSec >= startSec && barSec <= endSec
          return (
            <span
              key={index}
              aria-hidden="true"
              className={cn(
                'flex-1 rounded-full transition-colors',
                inRange ? 'bg-primary' : 'bg-muted-foreground/30',
              )}
              style={{ height: `${Math.max(12, Math.round(peak * 100))}%` }}
            />
          )
        })}
      </div>

      <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>00:00.0</span>
        <span>总长 {formatClipTimestamp(track.duration)}</span>
      </div>
    </div>
  )
}

export function AudioDialog({ open, onOpenChange, devices, sounds, inCall }: {
  open: boolean
  onOpenChange: (value: boolean) => void
  devices: ReturnType<typeof useDevices>
  sounds: ReturnType<typeof useCallSounds>
  inCall: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const clipPreviewRef = useRef<{ stop: () => void } | null>(null)
  const [track, setTrack] = useState<DecodedTrack | null>(null)
  const [clipStart, setClipStart] = useState(0)
  const [clipDuration, setClipDuration] = useState(MAX_RINGTONE_SECONDS)
  const [decoding, setDecoding] = useState(false)
  const [savingClip, setSavingClip] = useState(false)
  const [previewingClip, setPreviewingClip] = useState(false)
  const [clipError, setClipError] = useState('')
  const [clipSavedHint, setClipSavedHint] = useState('')

  const stopAll = () => {
    sounds.stopPreview()
    devices.stopTest()
    clipPreviewRef.current?.stop()
    clipPreviewRef.current = null
    setPreviewingClip(false)
  }
  const cleanup = useRef(stopAll)
  cleanup.current = stopAll

  useEffect(() => {
    if (!open) {
      cleanup.current()
      setClipError('')
      setClipSavedHint('')
    }
    return () => cleanup.current()
  }, [open])

  const ringtoneItems = [
    { value: 'soft', label: '轻柔和弦（内置）' },
    { value: 'classic', label: '经典双响（内置）' },
    {
      value: 'custom',
      label: sounds.customRingtone
        ? `自定义音乐 · ${sounds.customRingtone.name} (${sounds.customRingtone.durationSec.toFixed(0)}s)`
        : '自定义音乐剪辑（支持截取 ≤30秒）',
    },
    { value: 'off', label: '静音（保留来电显示）' },
  ]

  async function handleFileSelect(file: File | undefined) {
    if (!file) return
    stopAll()
    setDecoding(true)
    setClipError('')
    setClipSavedHint('')
    try {
      const decoded = await decodeAudioFile(file)
      const initial = clampClipRange(decoded.duration, 0, MAX_RINGTONE_SECONDS)
      setTrack(decoded)
      setClipStart(initial.startSec)
      setClipDuration(initial.durationSec)
    } catch (err) {
      setClipError(err instanceof Error ? err.message : '音频文件解析失败。')
    } finally {
      setDecoding(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function toggleClipPreview() {
    if (!track) return
    if (previewingClip) {
      clipPreviewRef.current?.stop()
      clipPreviewRef.current = null
      setPreviewingClip(false)
      return
    }
    sounds.stopPreview()
    devices.stopTest()
    setPreviewingClip(true)
    clipPreviewRef.current = previewClipBuffer(
      track.buffer,
      clipStart,
      clipDuration,
      sounds.ringVolume,
      devices.selectedOutput,
      () => {
        clipPreviewRef.current = null
        setPreviewingClip(false)
      },
    )
  }

  async function handleSaveClip() {
    if (!track) return
    stopAll()
    setSavingClip(true)
    setClipError('')
    setClipSavedHint('')
    try {
      const trimmed = trimAudioBufferToWav(track.buffer, clipStart, clipDuration)
      await sounds.saveClipRingtone({
        blob: trimmed.blob,
        name: track.fileName.slice(0, 28),
        startSec: trimmed.startSec,
        durationSec: trimmed.durationSec,
      })
      setClipSavedHint(`已截取 ${formatClipTimestamp(trimmed.startSec)}–${formatClipTimestamp(trimmed.startSec + trimmed.durationSec)}（${trimmed.durationSec.toFixed(1)} 秒）并设为来电铃声。`)
    } catch (err) {
      setClipError(err instanceof Error ? err.message : '保存剪辑铃声失败。')
    } finally {
      setSavingClip(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-lg" bottomStickOnMobile={false} closeProps={{ 'aria-label': '关闭声音设置' }}>
        <DialogHeader>
          <DialogTitle>声音与设备</DialogTitle>
          <DialogDescription>调整通话音量、音频设备，或上传音乐截取 30 秒片段作为来电铃声。</DialogDescription>
        </DialogHeader>

        <DialogPanel className="grid gap-6">
          <section className="grid gap-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Headphones size={17} />通话设备</h3>
            <Choice label="麦克风" items={devices.inputs} value={devices.selectedInput} onChange={devices.chooseInput} disabled={inCall} />
            <Choice label="扬声器" items={devices.outputs} value={devices.selectedOutput} onChange={value => void devices.chooseOutput(value)} disabled={!devices.outputSupported} />
            <p className="text-xs leading-relaxed text-muted-foreground">{devices.outputSupported ? '麦克风选择在下一通电话生效。' : '当前环境使用系统默认扬声器。'}</p>
            <Level label="通话音量" value={devices.volume} onChange={devices.setVolume} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={devices.testSpeaker}><Volume2 />测试扬声器</Button>
              <Button variant="ghost" disabled={inCall} loading={devices.refreshing} onClick={() => void devices.refresh(true)}><RefreshCw />刷新设备</Button>
            </div>
          </section>

          <Separator />

          <section className="grid gap-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><BellRing size={17} />铃声与 30 秒音乐剪辑</h3>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.flac,.wav,.m4a,.aac,.ogg,.opus,.webm"
                className="hidden"
                onChange={event => void handleFileSelect(event.target.files?.[0])}
              />
              <Button
                variant="outline"
                size="xs"
                disabled={inCall || decoding}
                loading={decoding}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={13} />选择音乐文件
              </Button>
            </div>

            <Choice
              label="来电铃声"
              items={ringtoneItems}
              value={sounds.ringtone}
              onChange={value => {
                stopAll()
                sounds.setRingtone(value as RingtoneMode)
              }}
            />

            {sounds.customRingtone && (
              <Card className="border-primary/30 bg-primary/10 py-0">
                <CardPanel className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    <Music size={14} className="shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{sounds.customRingtone.name}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        片段 {formatClipTimestamp(sounds.customRingtone.startSec)} – {formatClipTimestamp(sounds.customRingtone.startSec + sounds.customRingtone.durationSec)} · 共 {sounds.customRingtone.durationSec.toFixed(1)} 秒
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="删除自定义铃声"
                    title="删除自定义铃声"
                    disabled={inCall}
                    onClick={() => void sounds.removeCustomRingtone()}
                  >
                    <Trash2 size={14} />
                  </Button>
                </CardPanel>
              </Card>
            )}

            {track ? (
              <Card className="py-0">
                <CardPanel className="grid gap-3.5 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                      <Scissors size={14} className="shrink-0 text-primary" />
                      <span className="truncate">正在剪辑：{track.fileName}</span>
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      {[15, 20, 30].map(sec => {
                        const available = Math.min(sec, Math.floor(track.duration))
                        if (available < MIN_RINGTONE_SECONDS) return null
                        const active = Math.abs(clipDuration - available) < 0.2
                        return (
                          <Button
                            key={sec}
                            type="button"
                            variant={active ? 'default' : 'outline'}
                            size="xs"
                            className="h-6 px-2 font-mono text-[10px] sm:h-6"
                            onClick={() => {
                              const next = clampClipRange(track.duration, clipStart, sec)
                              setClipStart(next.startSec)
                              setClipDuration(next.durationSec)
                            }}
                          >
                            {sec}s
                          </Button>
                        )
                      })}
                    </div>
                  </div>

                  <WaveformTrimmer
                    track={track}
                    startSec={clipStart}
                    durationSec={clipDuration}
                    onStartChange={nextStart => {
                      setClipStart(nextStart)
                      setClipSavedHint('')
                    }}
                  />

                  {track.duration > MIN_RINGTONE_SECONDS && (
                    <div className="grid gap-1.5">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>截取时长（最长 30 秒，自动首尾淡入淡出）</span>
                        <span className="font-mono text-foreground">{clipDuration.toFixed(1)} 秒</span>
                      </div>
                      <Slider
                        value={Math.round(clipDuration)}
                        min={Math.min(MIN_RINGTONE_SECONDS, Math.floor(track.duration))}
                        max={Math.min(MAX_RINGTONE_SECONDS, Math.max(MIN_RINGTONE_SECONDS, Math.floor(track.duration)))}
                        onValueChange={val => {
                          const raw = Array.isArray(val) ? val[0] : val
                          const next = clampClipRange(track.duration, clipStart, raw)
                          setClipStart(next.startSec)
                          setClipDuration(next.durationSec)
                        }}
                        getAriaLabel={() => '截取时长'}
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button variant="outline" size="xs" disabled={inCall} onClick={toggleClipPreview}>
                      {previewingClip ? <><Square size={12} />停止试听</> : <><Play size={12} />试听所选片段</>}
                    </Button>
                    <Button size="xs" disabled={inCall || savingClip} loading={savingClip} onClick={() => void handleSaveClip()}>
                      <Check size={12} />保存并设为来电铃声
                    </Button>
                  </div>
                </CardPanel>
              </Card>
            ) : (
              <Alert>
                <Music />
                <AlertDescription className="text-[11px] leading-relaxed">
                  支持直接导入 <strong>MP3、FLAC、WAV、M4A/AAC、OGG</strong> 音频文件，在声波图上拖动截取任意 ≤30 秒片段，本机离线保存。
                </AlertDescription>
              </Alert>
            )}

            {clipError && (
              <Alert variant="error" className="py-2 text-xs">
                <AlertDescription>{clipError}</AlertDescription>
              </Alert>
            )}
            {clipSavedHint && (
              <Alert variant="info" className="py-2 text-xs">
                <AlertDescription>{clipSavedHint}</AlertDescription>
              </Alert>
            )}

            <Level label="铃声与提示音音量" value={sounds.ringVolume} onChange={sounds.setRingVolume} />
            <Label className="flex items-center gap-2 text-xs leading-relaxed" htmlFor="call-effects">
              <Switch id="call-effects" checked={sounds.effects} onCheckedChange={sounds.setEffects} />
              拨号按键、等待接通和结束提示音
            </Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={inCall || sounds.ringtone === 'off' || (sounds.ringtone === 'custom' && !sounds.customRingtone)}
                onClick={sounds.audition}
              >
                <Play />试听当前来电铃声
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              自定义剪辑铃声保存在本机 IndexedDB 中，重启客户端依然生效；内置与自定义提示音均在本地播放，不代表运营商已接通。
            </p>
          </section>
        </DialogPanel>

        <DialogFooter>
          <span className="mr-auto flex items-center gap-2 text-xs text-muted-foreground"><Mic size={14} />仅采集音频，无摄像头</span>
          <Button onClick={() => onOpenChange(false)}>完成</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  )
}

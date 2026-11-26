import { useCallback, useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'up-to-date'
  | 'error'

export interface UpdateDownloadEvent {
  event: 'Started' | 'Progress' | 'Finished'
  data?: {
    contentLength?: number
    chunkLength?: number
  }
}

export interface UpdateHandle {
  currentVersion: string
  version: string
  date?: string
  body?: string
  downloadAndInstall: (onEvent?: (event: UpdateDownloadEvent) => void) => Promise<void>
  close?: () => Promise<void>
}

export interface AppUpdaterState {
  supported: boolean
  status: UpdaterStatus
  currentVersion: string
  availableVersion: string | null
  releaseNotes: string
  releaseDate: string | null
  downloadedBytes: number
  totalBytes: number | null
  progressPercent: number | null
  deferredForCall: boolean
  error: string | null
  lastCheckedAt: number | null
}

export interface AppUpdaterDeps {
  isDesktop: () => boolean
  getAppVersion: () => Promise<string>
  checkUpdate: () => Promise<UpdateHandle | null>
  relaunchApp: () => Promise<void>
  beforeRelaunch?: () => Promise<void>
}

const DEFAULT_RELEASES_URL = 'https://github.com/westripa/simhub-phone-desktop/releases'
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const STARTUP_DELAY_MS = 4000

async function createDefaultDeps(beforeRelaunch?: () => Promise<void>): Promise<AppUpdaterDeps> {
  return {
    isDesktop: () => isTauri(),
    getAppVersion: async () => {
      const { getVersion } = await import('@tauri-apps/api/app')
      return getVersion()
    },
    checkUpdate: async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()
      if (!update) return null
      return {
        currentVersion: update.currentVersion,
        version: update.version,
        date: update.date,
        body: update.body,
        downloadAndInstall: onEvent => update.downloadAndInstall(onEvent as never),
        close: () => update.close(),
      }
    },
    relaunchApp: async () => {
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    },
    beforeRelaunch,
  }
}

export function formatUpdaterError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || '未知错误')
  const lower = raw.toLowerCase()
  if (lower.includes('signature') || lower.includes('pubkey') || lower.includes('verify')) {
    return '更新包签名校验失败，已拒绝安装。请前往 GitHub Releases 手动核对并下载安装包。'
  }
  if (lower.includes('404') || lower.includes('not found') || lower.includes('latest.json')) {
    return '当前暂无已发布的在线更新清单，您也可以前往 GitHub Releases 手动下载最新版本。'
  }
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('network') || lower.includes('connect') || lower.includes('error sending request')) {
    return '连接更新服务器超时或网络不可达，请检查网络或代理设置后重试。'
  }
  return `检查或安装更新失败：${raw}`
}

export function useAppUpdater({
  inCall,
  beforeRelaunch,
  depsOverride,
}: {
  inCall: boolean
  beforeRelaunch?: () => Promise<void>
  depsOverride?: AppUpdaterDeps
}) {
  const supported = depsOverride ? depsOverride.isDesktop() : isTauri()
  const [state, setState] = useState<AppUpdaterState>({
    supported,
    status: 'idle',
    currentVersion: '0.2.0',
    availableVersion: null,
    releaseNotes: '',
    releaseDate: null,
    downloadedBytes: 0,
    totalBytes: null,
    progressPercent: null,
    deferredForCall: false,
    error: null,
    lastCheckedAt: null,
  })
  const pendingRef = useRef<UpdateHandle | null>(null)
  const depsRef = useRef<AppUpdaterDeps | null>(depsOverride ?? null)
  const inCallRef = useRef(inCall)
  const busyRef = useRef(false)
  inCallRef.current = inCall

  const resolveDeps = useCallback(async () => {
    if (depsRef.current) return depsRef.current
    const created = await createDefaultDeps(beforeRelaunch)
    depsRef.current = created
    return created
  }, [beforeRelaunch])

  useEffect(() => {
    if (!supported) return
    let cancelled = false
    void resolveDeps().then(deps => deps.getAppVersion()).then(version => {
      if (!cancelled && version) {
        setState(prev => ({ ...prev, currentVersion: version }))
      }
    }).catch(() => {})
    return () => {
      cancelled = true
      void pendingRef.current?.close?.().catch(() => {})
      pendingRef.current = null
    }
  }, [supported, resolveDeps])

  const checkForUpdates = useCallback(async (manual = false) => {
    if (!supported || busyRef.current) return null
    busyRef.current = true
    setState(prev => ({
      ...prev,
      status: 'checking',
      error: null,
      deferredForCall: false,
    }))
    try {
      const deps = await resolveDeps()
      const version = await deps.getAppVersion().catch(() => state.currentVersion)
      const previous = pendingRef.current
      if (previous) {
        pendingRef.current = null
        await previous.close?.().catch(() => {})
      }
      const next = await deps.checkUpdate()
      if (!next) {
        setState(prev => ({
          ...prev,
          currentVersion: version || prev.currentVersion,
          status: manual ? 'up-to-date' : 'idle',
          availableVersion: null,
          releaseNotes: '',
          releaseDate: null,
          downloadedBytes: 0,
          totalBytes: null,
          progressPercent: null,
          error: null,
          lastCheckedAt: Date.now(),
        }))
        return null
      }
      pendingRef.current = next
      setState(prev => ({
        ...prev,
        currentVersion: next.currentVersion || version || prev.currentVersion,
        status: 'available',
        availableVersion: next.version,
        releaseNotes: next.body?.trim() || '',
        releaseDate: next.date ?? null,
        downloadedBytes: 0,
        totalBytes: null,
        progressPercent: null,
        error: null,
        lastCheckedAt: Date.now(),
      }))
      return next
    } catch (err) {
      setState(prev => ({
        ...prev,
        status: manual ? 'error' : prev.status === 'available' ? 'available' : 'idle',
        error: manual ? formatUpdaterError(err) : null,
        lastCheckedAt: Date.now(),
      }))
      return null
    } finally {
      busyRef.current = false
    }
  }, [supported, resolveDeps, state.currentVersion])

  const installUpdate = useCallback(async () => {
    if (!supported || busyRef.current) return false
    if (inCallRef.current) {
      setState(prev => ({
        ...prev,
        deferredForCall: true,
        error: '当前正在通话中，为避免中断语音会话，请在挂断后再安装更新。',
      }))
      return false
    }
    const update = pendingRef.current
    if (!update) return false
    busyRef.current = true
    let downloaded = 0
    let total: number | null = null
    setState(prev => ({
      ...prev,
      status: 'downloading',
      downloadedBytes: 0,
      totalBytes: null,
      progressPercent: 0,
      deferredForCall: false,
      error: null,
    }))
    try {
      await update.downloadAndInstall(event => {
        if (event.event === 'Started') {
          total = typeof event.data?.contentLength === 'number' && event.data.contentLength > 0
            ? event.data.contentLength
            : null
          setState(prev => ({
            ...prev,
            status: 'downloading',
            totalBytes: total,
            progressPercent: total ? 0 : null,
          }))
        } else if (event.event === 'Progress') {
          downloaded += event.data?.chunkLength ?? 0
          const percent = total ? Math.min(100, Math.round((downloaded / total) * 100)) : null
          setState(prev => ({
            ...prev,
            status: 'downloading',
            downloadedBytes: downloaded,
            totalBytes: total,
            progressPercent: percent,
          }))
        } else if (event.event === 'Finished') {
          setState(prev => ({
            ...prev,
            status: 'installing',
            downloadedBytes: downloaded,
            progressPercent: 100,
          }))
        }
      })
      const deps = await resolveDeps()
      await (beforeRelaunch ?? deps.beforeRelaunch)?.().catch(() => {})
      await deps.relaunchApp()
      return true
    } catch (err) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: formatUpdaterError(err),
      }))
      return false
    } finally {
      busyRef.current = false
    }
  }, [supported, resolveDeps, beforeRelaunch])

  useEffect(() => {
    if (!supported) return
    const startupTimer = setTimeout(() => {
      if (!inCallRef.current) {
        void checkForUpdates(false)
      }
    }, STARTUP_DELAY_MS)
    const periodicTimer = setInterval(() => {
      if (!inCallRef.current) {
        void checkForUpdates(false)
      }
    }, CHECK_INTERVAL_MS)
    return () => {
      clearTimeout(startupTimer)
      clearInterval(periodicTimer)
    }
  }, [supported, checkForUpdates])

  return {
    state,
    releasesUrl: DEFAULT_RELEASES_URL,
    checkForUpdates,
    installUpdate,
  }
}

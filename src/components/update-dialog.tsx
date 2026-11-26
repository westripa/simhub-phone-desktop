import { CheckCircle2, Download, ExternalLink, RefreshCw, ShieldAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog'
import type { AppUpdaterState } from '@/phone/hooks/use-app-updater'

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function UpdateDialog({
  open,
  onOpenChange,
  state,
  inCall,
  releasesUrl,
  onCheck,
  onInstall,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: AppUpdaterState
  inCall: boolean
  releasesUrl: string
  onCheck: () => void
  onInstall: () => void
}) {
  const checking = state.status === 'checking'
  const downloading = state.status === 'downloading'
  const installing = state.status === 'installing'
  const busy = checking || downloading || installing
  const hasUpdate = !!state.availableVersion

  return (
    <Dialog open={open} onOpenChange={next => { if (!downloading && !installing) onOpenChange(next) }}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            应用版本与自动更新
            <Badge variant="outline" className="font-mono text-xs">v{state.currentVersion}</Badge>
          </DialogTitle>
          <DialogDescription>
            从官方签名发布源（westripa/simhub-phone-desktop）检查并安装桌面端更新。
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="grid gap-3">
          {!state.supported && (
            <Alert>
              <AlertDescription>
                当前运行在网页开发模式下，自动安装仅在桌面端安装包（Windows / macOS / Linux）中可用。
              </AlertDescription>
            </Alert>
          )}

          {state.error && (
            <Alert variant="error">
              <ShieldAlert className="size-4" />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          {inCall && hasUpdate && !state.error && (
            <Alert>
              <AlertDescription>
                当前正在通话中，可先预览新版本说明，待通话结束后再一键下载安装并重启。
              </AlertDescription>
            </Alert>
          )}

          {hasUpdate ? (
            <div className="grid gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">发现新版本 v{state.availableVersion}</span>
                <Badge className="bg-primary text-primary-foreground">待更新</Badge>
              </div>
              {state.releaseDate && (
                <div className="text-[11px] text-muted-foreground">发布时间：{state.releaseDate}</div>
              )}
              {state.releaseNotes ? (
                <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-border/60 bg-background p-2 font-sans text-xs leading-relaxed text-foreground">
                  {state.releaseNotes}
                </pre>
              ) : (
                <div className="text-muted-foreground">包含稳定性改进与问题修复。</div>
              )}
            </div>
          ) : state.status === 'up-to-date' ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-foreground">
              <CheckCircle2 className="size-4 shrink-0 text-success" />
              <span>当前已是最新版本（v{state.currentVersion}）。</span>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              {checking ? '正在连接 GitHub Releases 检查更新…' : '点击下方“检查更新”以核对是否有新版本可用。'}
            </div>
          )}

          {(downloading || installing) && (
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{installing ? '正在校验签名并安装更新，完成后将自动重启…' : '正在下载更新包…'}</span>
                <span className="font-mono tabular-nums">
                  {state.progressPercent !== null
                    ? `${state.progressPercent}%`
                    : formatBytes(state.downloadedBytes)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-150"
                  style={{ width: `${state.progressPercent ?? (installing ? 100 : 35)}%` }}
                />
              </div>
              {state.totalBytes !== null && (
                <div className="text-right font-mono text-[11px] text-muted-foreground">
                  {formatBytes(state.downloadedBytes)} / {formatBytes(state.totalBytes)}
                </div>
              )}
            </div>
          )}
        </DialogPanel>

        <DialogFooter className="flex-wrap justify-between gap-2">
          <a
            href={releasesUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
            <span>查看 Releases</span>
          </a>

          <div className="flex items-center gap-2">
            {!downloading && !installing && (
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
            )}
            <Button variant="secondary" size="sm" disabled={!state.supported || busy} onClick={onCheck}>
              <RefreshCw className={checking ? 'size-3.5 animate-spin' : 'size-3.5'} />
              <span>检查更新</span>
            </Button>
            {hasUpdate && (
              <Button size="sm" disabled={!state.supported || busy || inCall} onClick={onInstall}>
                <Download className="size-3.5" />
                <span>{installing ? '安装中…' : downloading ? '下载中…' : '立即更新并重启'}</span>
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  )
}

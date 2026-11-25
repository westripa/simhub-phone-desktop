import { CircleAlert, Plug } from 'lucide-react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { Account, Connection } from '@/phone/types'

export function ConnectionBanner({ account, connection, busy, onConnect, onSettings, onOpenNumbers }: {
  account: Account
  connection: Connection
  busy: boolean
  onConnect: () => void
  onSettings: () => void
  onOpenNumbers?: () => void
}) {
  const demo = account.mode === 'demo'
  const error = connection === 'error'
  const connecting = connection === 'connecting'
  const title = connecting
    ? '正在连接'
    : error
      ? '连接异常'
      : demo
        ? '本地演示'
        : '账号未连接'
  const body = connecting
    ? '正在注册 SIP 账号，请稍候。'
    : error
      ? '请检查 SIP 地址、证书或凭据，然后重试。'
      : demo
        ? '当前不连接服务器，也不会拨打真实电话；可随时导入/绑定 SIP 号码。'
        : '配置或导入标准 SIP 账号并连接后即可拨打与接听。'

  return (
    <Alert variant={error ? 'warning' : 'info'} className="mb-4" aria-label="连接状态">
      {error ? <CircleAlert /> : <Plug />}
      <AlertTitle className="text-xs">{title}</AlertTitle>
      <AlertDescription className="text-[11px] leading-relaxed">{body}</AlertDescription>
      <AlertAction className="flex-wrap">
        {onOpenNumbers && (
          <Button variant="outline" size="xs" disabled={busy} onClick={onOpenNumbers}>
            {demo ? '绑定/导入号码' : '号码管理'}
          </Button>
        )}
        {!demo && <Button variant="ghost" size="xs" disabled={busy} onClick={onSettings}>高级设置</Button>}
        <Button size="xs" loading={connecting} disabled={busy || connecting} onClick={onConnect}>
          {error ? '重新连接' : demo ? '开始演示' : '连接账号'}
        </Button>
      </AlertAction>
    </Alert>
  )
}

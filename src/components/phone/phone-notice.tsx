import { CircleAlert, X } from 'lucide-react'
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function PhoneNotice({ message, onDismiss, onResumeAudio }: {
  message: string
  onDismiss: () => void
  onResumeAudio?: () => void
}) {
  if (!message) return null
  return (
    <Alert variant="warning" className="shrink-0 rounded-none border-x-0 border-t-0 px-4 py-2 text-[11px]">
      <CircleAlert />
      <AlertDescription className="text-[11px] leading-relaxed text-foreground">{message}</AlertDescription>
      <AlertAction>
        {onResumeAudio && <Button variant="outline" size="xs" onClick={onResumeAudio}>播放声音</Button>}
        <Button variant="ghost" size="icon-xs" aria-label="关闭提示" onClick={onDismiss}><X size={14} /></Button>
      </AlertAction>
    </Alert>
  )
}

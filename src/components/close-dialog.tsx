import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPopup, DialogTitle } from '@/components/ui/dialog'

export function CloseDialog({ mode, ending, dismiss, endAndExit, forceExit }: {
  mode: 'call' | 'unknown' | null; ending: boolean; dismiss: () => void; endAndExit: () => void; forceExit: () => void
}) {
  return <Dialog open={mode !== null} onOpenChange={open => { if (!open) dismiss() }}>
    <DialogPopup className="max-w-md" bottomStickOnMobile={false} closeProps={{ 'aria-label': '返回客户端' }}>
      <DialogHeader>
        <DialogTitle>{mode === 'unknown' ? '通话结果尚未确认' : ending ? '正在结束通话' : '当前仍有通话'}</DialogTitle>
        <DialogDescription>{mode === 'unknown' ? '连接已中断或挂断未得到确认。退出客户端不能证明线路已释放，请先核对线路状态。' : ending ? '正在等待结束确认，不会重复发送挂断。' : '退出前先结束当前通话，避免通话仍在继续。'}</DialogDescription>
      </DialogHeader>
      <DialogFooter><Button variant="outline" onClick={dismiss}>返回客户端</Button><Button variant="destructive" disabled={ending && mode !== 'unknown'} onClick={mode === 'unknown' ? forceExit : endAndExit}>{mode === 'unknown' ? '仍然退出' : ending ? '等待结束' : '挂断并退出'}</Button></DialogFooter>
    </DialogPopup>
  </Dialog>
}

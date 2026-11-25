import type { Connection, Outcome, Phase } from './types'

export const connectionLabel: Record<Connection, string> = {
  offline: '未连接',
  connecting: '连接中',
  registered: '已就绪',
  error: '连接异常',
}

export const phaseLabel: Record<Phase, string> = {
  dialing: '正在呼叫',
  ringing: '对方振铃中',
  incoming: '等待接听',
  answering: '正在接听',
  connected: '通话中',
  ending: '正在结束',
}

export const outcomeLabel: Record<Outcome, string> = {
  completed: '已结束',
  cancelled: '已取消',
  rejected: '已拒接',
  missed: '未接来电',
  failed: '未接通',
  unknown: '结果未知',
}

export const directionLabel: Record<'incoming' | 'outgoing', string> = {
  incoming: '呼入',
  outgoing: '呼出',
}

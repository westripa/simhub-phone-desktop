export function formatClock(value: number): string {
  return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function formatHistoryTime(value: number): string {
  const date = new Date(value)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return formatClock(value)
  return `${date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })} ${formatClock(value)}`
}

import { afterEach, describe, expect, test } from 'bun:test'
import { buildIncomingAlertText, notifyDesktopEvent } from './use-desktop-alert'
import type { Call } from '../types'

const originalNotification = globalThis.Notification

afterEach(() => {
  if (originalNotification === undefined) {
    delete (globalThis as { Notification?: unknown }).Notification
  } else {
    globalThis.Notification = originalNotification
  }
})

describe('桌面来电通知与文本组装', () => {
  test('普通来电携带本机号码时生成清晰双号码通知', () => {
    const call: Call = {
      id: 'call-1',
      peer: '+12025550199',
      ownNumber: '+12025550187',
      direction: 'incoming',
      phase: 'incoming',
      started: 1,
    }
    const text = buildIncomingAlertText(call)
    expect(text.title).toBe('来电 · +12025550199')
    expect(text.body).toBe('打给本机：+12025550187 · 点击唤醒窗口接听')
  })

  test('AI 转接来电包含转接标记与原因', () => {
    const call: Call = {
      id: 'call-2',
      peer: '+447700900111',
      ownNumber: '+447700900421',
      direction: 'incoming',
      phase: 'incoming',
      started: 2,
      transferSource: 'ai',
      transferReason: '客户要求转人工客服',
    }
    const text = buildIncomingAlertText(call)
    expect(text.title).toBe('AI 转接来电 · +447700900111')
    expect(text.body).toBe('打给本机：+447700900421 · 转接原因：客户要求转人工客服')
  })

  test('Web Notification 权限已授予时创建通知并支持关闭清理', async () => {
    let closed = 0
    const created: { title: string; options: NotificationOptions | undefined }[] = []

    class FakeNotification {
      static permission: NotificationPermission = 'granted'
      static requestPermission = async () => 'granted' as NotificationPermission
      onclick: (() => void) | null = null
      constructor(title: string, options?: NotificationOptions) {
        created.push({ title, options })
      }
      close() {
        closed += 1
      }
    }

    globalThis.Notification = FakeNotification as unknown as typeof Notification
    const cleanup = await notifyDesktopEvent('来电 · 9202', '点击唤醒窗口接听', {
      urgent: true,
      tag: 'incoming-call-3',
    })

    expect(created).toHaveLength(1)
    expect(created[0]?.title).toBe('来电 · 9202')
    expect(created[0]?.options?.requireInteraction).toBe(true)
    expect(created[0]?.options?.tag).toBe('incoming-call-3')
    cleanup?.()
    expect(closed).toBe(1)
  })
})

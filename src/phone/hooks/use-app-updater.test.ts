import { describe, expect, test } from 'bun:test'
import { formatUpdaterError } from './use-app-updater'

describe('desktop updater helpers', () => {
  test('formatUpdaterError maps signature, 404 and network errors clearly', () => {
    expect(formatUpdaterError(new Error('Invalid signature for payload'))).toContain('签名校验失败')
    expect(formatUpdaterError(new Error('HTTP 404 Not Found fetching latest.json'))).toContain('GitHub Releases')
    expect(formatUpdaterError(new Error('error sending request for url: connection timed out'))).toContain('超时')
  })
})

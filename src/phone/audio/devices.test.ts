import { expect, test } from 'bun:test'
import { audioDeviceOptions } from './devices'

test('未授权设备占位项不能与系统默认重复', () => {
  const devices = [
    { deviceId: '', kind: 'audioinput' as const, label: '' },
    { deviceId: 'default', kind: 'audioinput' as const, label: '默认麦克风' },
    { deviceId: 'fixture-mic', kind: 'audioinput' as const, label: '测试麦克风' },
  ]
  expect(audioDeviceOptions(devices, 'audioinput').map(item => item.value)).toEqual(['', 'fixture-mic'])
})

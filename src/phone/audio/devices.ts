type Device = Pick<MediaDeviceInfo, 'deviceId' | 'label' | 'kind'>

export function audioDeviceOptions(devices: Device[], kind: MediaDeviceKind) {
  return [{ value: '', label: '系统默认' }, ...devices.filter(device => device.kind === kind && device.deviceId && !['default', 'communications'].includes(device.deviceId)).map((device, index) => ({ value: device.deviceId, label: device.label || `${kind === 'audioinput' ? '麦克风' : '扬声器'} ${index + 1}` }))]
}

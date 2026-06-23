export async function getInputDevices(): Promise<MediaDeviceInfo[]> {
  return getDevicesByKind('audioinput')
}

export async function getOutputDevices(): Promise<MediaDeviceInfo[]> {
  return getDevicesByKind('audiooutput')
}

async function getDevicesByKind(kind: 'audioinput' | 'audiooutput'): Promise<MediaDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter((device) => device.kind === kind)
  } catch (error) {
    if (error instanceof Error && (error.name === 'NotFoundError' || error.name === 'PermissionDeniedError')) {
      console.warn(`Failed to enumerate ${kind} devices: ${error.name}`)
      return []
    }
    console.warn(`Failed to enumerate ${kind} devices`, error)
    return []
  }
}

export function getLabelOrDefault(device: MediaDeviceInfo, index = 0): string {
  if (device.label) return device.label
  const fallback = device.kind === 'audioinput' ? 'Microphone' : 'Speaker'
  return `${fallback} ${index + 1}`
}

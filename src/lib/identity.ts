import { useSettingsStore } from '../store/settingsStore'

const WISP_ID_KEY = 'wisp-id'
const WISP_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const WISP_ID_LENGTH = 8

function generateWispId(): string {
  let id = ''
  for (let i = 0; i < WISP_ID_LENGTH; i++) {
    id += WISP_ID_CHARS[Math.floor(Math.random() * WISP_ID_CHARS.length)]
  }
  return id
}

export function getWispId(): string {
  try {
    const existing = localStorage.getItem(WISP_ID_KEY)
    if (existing) return existing

    const id = generateWispId()
    localStorage.setItem(WISP_ID_KEY, id)
    return id
  } catch {
    // localStorage unavailable; fall back to a per-session id rather than throwing
    return generateWispId()
  }
}

export function getDisplayName(): string {
  return useSettingsStore.getState().displayName || 'Guest'
}

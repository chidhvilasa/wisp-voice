import { WispVoiceEngine } from './webrtc'
import { useSettingsStore } from '../store/settingsStore'
import type { RecentRoom } from '../types'

const RECENT_ROOMS_KEY = 'wisp-recent-rooms'
const MAX_RECENT_ROOMS = 5
const ROOM_CODE_PATTERN = /^[A-Za-z0-9]{6}$/
const CREATE_ROOM_TIMEOUT_MS = 10000
const SIGNALING_URL = 'https://wisp-signaling.chidhvilasa2004.workers.dev'

let engineInstance: WispVoiceEngine | null = null

export function getVoiceEngine(): WispVoiceEngine {
  if (!engineInstance) {
    engineInstance = new WispVoiceEngine()
  }
  return engineInstance
}

export function destroyVoiceEngine(): void {
  engineInstance?.disconnect()
  engineInstance = null
}

export async function createRoom(): Promise<string> {
  const baseUrl = SIGNALING_URL
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), CREATE_ROOM_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${baseUrl}/room`, { method: 'POST', signal: controller.signal })
  } catch {
    throw new Error('Unable to create a room. Check your internet connection and try again.')
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Unable to create a room (server responded ${response.status}${body ? `: ${body}` : ''}). Please try again in a moment.`,
    )
  }

  let data: { code?: string }
  try {
    data = (await response.json()) as { code?: string }
  } catch {
    throw new Error('Unable to create a room: the server returned an unexpected response.')
  }

  if (!data.code) {
    throw new Error('Unable to create a room: the server returned an unexpected response.')
  }

  return data.code
}

export async function joinRoom(code: string): Promise<void> {
  if (!ROOM_CODE_PATTERN.test(code)) {
    throw new Error('Room code must be exactly 6 alphanumeric characters.')
  }

  const displayName = useSettingsStore.getState().displayName
  const engine = getVoiceEngine()
  await engine.connect(code, displayName)
}

export function lockRoom(): void {
  getVoiceEngine().sendRoomLocked()
}

export function getRecentRooms(): RecentRoom[] {
  try {
    const raw = localStorage.getItem(RECENT_ROOMS_KEY)
    if (!raw) return []
    const rooms = JSON.parse(raw) as RecentRoom[]
    if (!Array.isArray(rooms)) return []
    return [...rooms].sort((a, b) => b.lastUsed - a.lastUsed).slice(0, MAX_RECENT_ROOMS)
  } catch {
    return []
  }
}

export function saveRecentRoom(room: RecentRoom): void {
  const existing = getRecentRooms().filter((entry) => entry.code !== room.code)
  const updated = [room, ...existing].slice(0, MAX_RECENT_ROOMS)
  try {
    localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(updated))
  } catch {
    // localStorage unavailable or full; recent-room persistence is best-effort
  }
}

export function removeRecentRoom(code: string): void {
  const updated = getRecentRooms().filter((entry) => entry.code !== code)
  try {
    localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(updated))
  } catch {
    // localStorage unavailable or full; recent-room persistence is best-effort
  }
}

export type ConnectionQuality = 'good' | 'ok' | 'poor'
export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'
export type OverlayMode = 'compact' | 'full'

export interface Peer {
  id: string
  name: string
  muted: boolean
  deafened: boolean
  speaking: boolean
  quality: ConnectionQuality
  latencyMs: number
}

export interface ChatMessage {
  id: string
  from: string
  content: string
  timestamp: number
}

export interface RecentRoom {
  code: string
  name: string
  lastUsed: number
  memberCount: number
}

export interface HotkeyMap {
  mute: string
  deafen: string
  overlayToggle: string
  overlayMode: string
  soundboard1: string
  soundboard2: string
  soundboard3: string
  soundboard4: string
  soundboard5: string
}

export interface PeerStats {
  peerId: string
  rttMs: number
  quality: ConnectionQuality
  bytesSent: number
  bytesReceived: number
}

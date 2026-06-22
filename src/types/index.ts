export type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "error";

export type ConnectionQuality = "good" | "ok" | "poor";

export type OverlayMode = "compact" | "full";

export interface Peer {
  id: string;
  name: string;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  quality: ConnectionQuality;
  latencyMs: number;
}

export interface ChatMessage {
  id: string;
  from: string;
  content: string;
  timestamp: number;
}

export interface Room {
  code: string;
  name: string;
  locked: boolean;
  hostId: string;
  peers: Peer[];
}

export interface HotkeyMap {
  mute: string;
  deafen: string;
  overlayToggle: string;
  overlayMode: string;
  soundboard1: string;
  soundboard2: string;
  soundboard3: string;
  soundboard4: string;
  soundboard5: string;
}

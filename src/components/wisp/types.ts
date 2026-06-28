export type PeerId = string;

export interface Peer {
  id: PeerId;
  name: string;
  isSelf?: boolean;
  speaking?: boolean;
  muted?: boolean;
  deafened?: boolean;
  signal?: 1 | 2 | 3;
  latencyMs?: number;
  connecting?: boolean;
}

export interface ChatMessage {
  id: string;
  authorId: PeerId | "system";
  authorName?: string;
  text: string;
  timestamp: number;
  system?: boolean;
}

export interface Hotkey {
  id: string;
  label: string;
  combo: string;
}

export interface RecentRoom {
  code: string;
  members: number;
  lastJoined: number;
}

export type OverlayCorner = "tl" | "tr" | "bl" | "br";
export type OverlayMode = "compact" | "full";

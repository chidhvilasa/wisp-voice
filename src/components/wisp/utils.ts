import type { PeerId } from "./types";

const AVATAR_COLORS = [
  "oklch(0.70 0.17 25)",
  "oklch(0.74 0.16 60)",
  "oklch(0.78 0.17 110)",
  "oklch(0.74 0.18 150)",
  "oklch(0.74 0.17 195)",
  "oklch(0.70 0.18 250)",
  "oklch(0.68 0.20 300)",
  "oklch(0.72 0.20 340)",
];

export function avatarColor(id: PeerId): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed[0]!.toUpperCase();
}

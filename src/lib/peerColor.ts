const PEER_COLOR_PALETTE = [
  '#7C5CFC',
  '#06B6D4',
  '#F59E0B',
  '#EF4444',
  '#22C55E',
  '#EC4899',
  '#F97316',
  '#8B5CF6',
]

export function getPeerColor(peerId: string): string {
  let hash = 0
  for (let i = 0; i < peerId.length; i++) {
    hash = (hash * 31 + peerId.charCodeAt(i)) >>> 0
  }
  return PEER_COLOR_PALETTE[hash % PEER_COLOR_PALETTE.length]!
}

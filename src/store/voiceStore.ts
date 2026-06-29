import { create } from 'zustand'
import { emit } from '@tauri-apps/api/event'
import type { ChatMessage, ConnectionState, Peer } from '../types'

function emitSafe(event: string, payload: unknown): void {
  void (async () => {
    try {
      await emit(event, payload)
    } catch {
      // Tauri APIs unavailable outside a Tauri window (browser/tests)
    }
  })()
}

interface VoiceState {
  roomCode: string
  displayName: string
  peers: Map<string, Peer>
  localMuted: boolean
  localDeafened: boolean
  localSpeaking: boolean
  previousMutedState: boolean
  isHost: boolean
  connectionState: ConnectionState
  chatMessages: ChatMessage[]
  lastError: string | null
  turnUnavailable: boolean
  setRoomCode: (roomCode: string) => void
  setDisplayName: (displayName: string) => void
  setPeer: (peer: Peer) => void
  removePeer: (peerId: string) => void
  setLocalMuted: (muted: boolean) => void
  setLocalDeafened: (deafened: boolean) => void
  setPreviousMutedState: (muted: boolean) => void
  setLocalSpeaking: (speaking: boolean) => void
  setIsHost: (isHost: boolean) => void
  setConnectionState: (state: ConnectionState) => void
  addChatMessage: (message: ChatMessage) => void
  setLastError: (error: string | null) => void
  setTurnUnavailable: (turnUnavailable: boolean) => void
  republishState: () => void
  reset: () => void
}

const initialState = {
  roomCode: '',
  displayName: '',
  peers: new Map<string, Peer>(),
  localMuted: false,
  localDeafened: false,
  localSpeaking: false,
  previousMutedState: false,
  isHost: false,
  connectionState: 'idle' as ConnectionState,
  chatMessages: [] as ChatMessage[],
  lastError: null as string | null,
  turnUnavailable: false,
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  ...initialState,

  setRoomCode: (roomCode) => set({ roomCode }),

  setDisplayName: (displayName) => set({ displayName }),

  setPeer: (peer) =>
    set((state) => {
      const previous = state.peers.get(peer.id)
      const peers = new Map(state.peers)
      peers.set(peer.id, peer)
      emitSafe('peers-updated', Array.from(peers.values()))
      if (!previous || previous.speaking !== peer.speaking) {
        emitSafe('speaking-changed', { peerId: peer.id, speaking: peer.speaking })
      }
      return { peers }
    }),

  removePeer: (peerId) =>
    set((state) => {
      const peers = new Map(state.peers)
      peers.delete(peerId)
      emitSafe('peers-updated', Array.from(peers.values()))
      return { peers }
    }),

  setLocalMuted: (muted) => {
    emitSafe('mute-changed', muted)
    set({ localMuted: muted })
  },

  setLocalDeafened: (deafened) => set({ localDeafened: deafened }),

  setPreviousMutedState: (muted) => set({ previousMutedState: muted }),

  setLocalSpeaking: (speaking) => set({ localSpeaking: speaking }),

  setIsHost: (isHost) => set({ isHost }),

  setConnectionState: (connectionState) => set({ connectionState }),

  addChatMessage: (message) =>
    set((state) => ({ chatMessages: [...state.chatMessages, message] })),

  setLastError: (lastError) => set({ lastError }),

  setTurnUnavailable: (turnUnavailable) => set({ turnUnavailable }),

  // The overlay window is re-navigated (full reload) each time it's shown,
  // so its 'peers-updated'/'mute-changed' listeners only see future events.
  // Calling this when the overlay becomes visible replays current state so
  // peers who joined while it was hidden aren't missing.
  republishState: () => {
    const state = get()
    emitSafe('peers-updated', Array.from(state.peers.values()))
    emitSafe('mute-changed', state.localMuted)
  },

  reset: () =>
    set({
      ...initialState,
      peers: new Map<string, Peer>(),
      chatMessages: [],
    }),
}))

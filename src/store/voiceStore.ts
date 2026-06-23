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
  connectionState: ConnectionState
  chatMessages: ChatMessage[]
  setRoomCode: (roomCode: string) => void
  setDisplayName: (displayName: string) => void
  setPeer: (peer: Peer) => void
  removePeer: (peerId: string) => void
  setLocalMuted: (muted: boolean) => void
  setLocalDeafened: (deafened: boolean) => void
  setLocalSpeaking: (speaking: boolean) => void
  setConnectionState: (state: ConnectionState) => void
  addChatMessage: (message: ChatMessage) => void
  reset: () => void
}

const initialState = {
  roomCode: '',
  displayName: '',
  peers: new Map<string, Peer>(),
  localMuted: false,
  localDeafened: false,
  localSpeaking: false,
  connectionState: 'idle' as ConnectionState,
  chatMessages: [] as ChatMessage[],
}

export const useVoiceStore = create<VoiceState>((set) => ({
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

  setLocalSpeaking: (speaking) => set({ localSpeaking: speaking }),

  setConnectionState: (connectionState) => set({ connectionState }),

  addChatMessage: (message) =>
    set((state) => ({ chatMessages: [...state.chatMessages, message] })),

  reset: () =>
    set({
      ...initialState,
      peers: new Map<string, Peer>(),
      chatMessages: [],
    }),
}))

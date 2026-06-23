import { create } from 'zustand'
import type { ChatMessage, ConnectionState, Peer } from '../types'

interface VoiceState {
  roomCode: string
  displayName: string
  peers: Map<string, Peer>
  localMuted: boolean
  localDeafened: boolean
  connectionState: ConnectionState
  chatMessages: ChatMessage[]
  setRoomCode: (roomCode: string) => void
  setDisplayName: (displayName: string) => void
  setPeer: (peer: Peer) => void
  removePeer: (peerId: string) => void
  setLocalMuted: (muted: boolean) => void
  setLocalDeafened: (deafened: boolean) => void
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
  connectionState: 'idle' as ConnectionState,
  chatMessages: [] as ChatMessage[],
}

export const useVoiceStore = create<VoiceState>((set) => ({
  ...initialState,

  setRoomCode: (roomCode) => set({ roomCode }),

  setDisplayName: (displayName) => set({ displayName }),

  setPeer: (peer) =>
    set((state) => {
      const peers = new Map(state.peers)
      peers.set(peer.id, peer)
      return { peers }
    }),

  removePeer: (peerId) =>
    set((state) => {
      const peers = new Map(state.peers)
      peers.delete(peerId)
      return { peers }
    }),

  setLocalMuted: (muted) => set({ localMuted: muted }),

  setLocalDeafened: (deafened) => set({ localDeafened: deafened }),

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

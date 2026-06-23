import { useCallback, useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { destroyVoiceEngine, getVoiceEngine } from '../lib/rooms'
import { useVoiceStore } from '../store/voiceStore'
import { useSettingsStore } from '../store/settingsStore'
import type { ChatMessage, ConnectionState, Peer, PeerStats } from '../types'

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 30000]
const MAX_RECONNECT_ATTEMPTS = 5

export interface UseVoiceResult {
  connect: (roomCode: string, displayName: string) => Promise<void>
  disconnect: () => void
  toggleMute: () => void
  toggleDeafen: () => void
  sendChat: (content: string) => void
  setPeerVolume: (peerId: string, volume: number) => void
  connectionState: ConnectionState
  peers: Peer[]
}

function playSoundboardSlot(slot: number): void {
  const filePath = useSettingsStore.getState().soundboardFiles[slot]
  if (!filePath) return
  try {
    void new Audio(filePath).play().catch(() => {})
  } catch {
    // playback unavailable in this environment
  }
}

export function useVoice(): UseVoiceResult {
  const engineRef = useRef(getVoiceEngine())
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRoomRef = useRef<{ code: string; displayName: string } | null>(null)
  const overlayVisibleRef = useRef(false)

  const peersMap = useVoiceStore((state) => state.peers)
  const connectionState = useVoiceStore((state) => state.connectionState)
  const localMuted = useVoiceStore((state) => state.localMuted)
  const localDeafened = useVoiceStore((state) => state.localDeafened)

  const setRoomCode = useVoiceStore((state) => state.setRoomCode)
  const setDisplayName = useVoiceStore((state) => state.setDisplayName)
  const setPeer = useVoiceStore((state) => state.setPeer)
  const removePeer = useVoiceStore((state) => state.removePeer)
  const setLocalMuted = useVoiceStore((state) => state.setLocalMuted)
  const setLocalDeafened = useVoiceStore((state) => state.setLocalDeafened)
  const setConnectionState = useVoiceStore((state) => state.setConnectionState)
  const addChatMessage = useVoiceStore((state) => state.addChatMessage)
  const resetVoiceStore = useVoiceStore((state) => state.reset)

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const scheduleReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setConnectionState('error')
      return
    }

    const delay =
      RECONNECT_DELAYS_MS[reconnectAttemptsRef.current] ??
      RECONNECT_DELAYS_MS[RECONNECT_DELAYS_MS.length - 1]
    reconnectAttemptsRef.current += 1

    clearReconnectTimer()
    reconnectTimerRef.current = setTimeout(() => {
      const room = lastRoomRef.current
      const engine = engineRef.current
      if (!room || !engine) return

      engine
        .connect(room.code, room.displayName)
        .then(() => {
          reconnectAttemptsRef.current = 0
        })
        .catch(() => {
          scheduleReconnect()
        })
    }, delay)
  }, [clearReconnectTimer, setConnectionState])

  const connect = useCallback(
    async (roomCode: string, displayName: string) => {
      lastRoomRef.current = { code: roomCode, displayName }
      setRoomCode(roomCode)
      setDisplayName(displayName)
      clearReconnectTimer()
      reconnectAttemptsRef.current = 0

      try {
        await engineRef.current.connect(roomCode, displayName)
      } catch {
        scheduleReconnect()
      }
    },
    [setRoomCode, setDisplayName, clearReconnectTimer, scheduleReconnect],
  )

  const disconnect = useCallback(() => {
    clearReconnectTimer()
    reconnectAttemptsRef.current = 0
    lastRoomRef.current = null
    engineRef.current.disconnect()
    resetVoiceStore()
  }, [clearReconnectTimer, resetVoiceStore])

  const toggleMute = useCallback(() => {
    const next = !localMuted
    engineRef.current.setMuted(next)
    setLocalMuted(next)
  }, [localMuted, setLocalMuted])

  const toggleDeafen = useCallback(() => {
    const next = !localDeafened
    engineRef.current.setDeafened(next)
    setLocalDeafened(next)
  }, [localDeafened, setLocalDeafened])

  const sendChat = useCallback(
    (content: string) => {
      const displayName = useVoiceStore.getState().displayName
      engineRef.current.sendChat(content, displayName)
    },
    [],
  )

  const setPeerVolume = useCallback((peerId: string, volume: number) => {
    engineRef.current.setPeerVolume(peerId, volume)
  }, [])

  useEffect(() => {
    const engine = engineRef.current

    const handlePeerJoined = (peerId: string) => {
      setPeer({
        id: peerId,
        name: peerId,
        muted: false,
        deafened: false,
        speaking: false,
        quality: 'good',
        latencyMs: 0,
      })
    }

    const handlePeerLeft = (peerId: string) => {
      removePeer(peerId)
    }

    const handleSpeaking = (peerId: string, isSpeaking: boolean) => {
      const peer = useVoiceStore.getState().peers.get(peerId)
      if (peer) {
        setPeer({ ...peer, speaking: isSpeaking })
      }
    }

    const handleConnectionStateChange = (state: ConnectionState) => {
      setConnectionState(state)
      if (state === 'connected') {
        reconnectAttemptsRef.current = 0
        clearReconnectTimer()
        const { roomCode, displayName } = useVoiceStore.getState()
        if (roomCode) {
          lastRoomRef.current = { code: roomCode, displayName }
        }
      } else if (state === 'reconnecting') {
        scheduleReconnect()
      }
    }

    const handleChatMessage = (message: ChatMessage) => {
      addChatMessage(message)
    }

    const handlePeerStats = (stats: Map<string, PeerStats>) => {
      for (const [peerId, peerStats] of stats) {
        const peer = useVoiceStore.getState().peers.get(peerId)
        if (peer) {
          setPeer({ ...peer, quality: peerStats.quality, latencyMs: Math.round(peerStats.rttMs) })
        }
      }
    }

    const handleError = () => {
      scheduleReconnect()
    }

    engine.on('peer-joined', handlePeerJoined)
    engine.on('peer-left', handlePeerLeft)
    engine.on('speaking', handleSpeaking)
    engine.on('connection-state-change', handleConnectionStateChange)
    engine.on('chat-message', handleChatMessage)
    engine.on('peer-stats', handlePeerStats)
    engine.on('error', handleError)

    return () => {
      engine.off('peer-joined', handlePeerJoined)
      engine.off('peer-left', handlePeerLeft)
      engine.off('speaking', handleSpeaking)
      engine.off('connection-state-change', handleConnectionStateChange)
      engine.off('chat-message', handleChatMessage)
      engine.off('peer-stats', handlePeerStats)
      engine.off('error', handleError)
      clearReconnectTimer()
      destroyVoiceEngine()
    }
  }, [
    setPeer,
    removePeer,
    setConnectionState,
    addChatMessage,
    clearReconnectTimer,
    scheduleReconnect,
  ])

  useEffect(() => {
    let cancelled = false
    const unlistenFns: Array<() => void> = []

    const handleOverlayToggle = () => {
      overlayVisibleRef.current = !overlayVisibleRef.current
      void invoke(overlayVisibleRef.current ? 'show_overlay' : 'hide_overlay').catch(() => {})
    }

    const handleOverlayMode = () => {
      const current = useSettingsStore.getState().overlayMode
      useSettingsStore.getState().setOverlayMode(current === 'compact' ? 'full' : 'compact')
    }

    const subscriptions: Record<string, () => void> = {
      'tray-toggle-mute': toggleMute,
      'tray-toggle-deafen': toggleDeafen,
      'tray-leave-room': disconnect,
      'hotkey-mute': toggleMute,
      'hotkey-deafen': toggleDeafen,
      'hotkey-overlay-toggle': handleOverlayToggle,
      'hotkey-overlay-mode': handleOverlayMode,
      'hotkey-soundboard-1': () => playSoundboardSlot(0),
      'hotkey-soundboard-2': () => playSoundboardSlot(1),
      'hotkey-soundboard-3': () => playSoundboardSlot(2),
      'hotkey-soundboard-4': () => playSoundboardSlot(3),
      'hotkey-soundboard-5': () => playSoundboardSlot(4),
    }

    void (async () => {
      for (const [eventName, handler] of Object.entries(subscriptions)) {
        try {
          const unlisten = await listen(eventName, () => handler())
          if (cancelled) {
            unlisten()
          } else {
            unlistenFns.push(unlisten)
          }
        } catch {
          console.warn(`Failed to register listener for ${eventName}`)
        }
      }
    })()

    return () => {
      cancelled = true
      for (const unlisten of unlistenFns) {
        unlisten()
      }
    }
  }, [toggleMute, toggleDeafen, disconnect])

  return {
    connect,
    disconnect,
    toggleMute,
    toggleDeafen,
    sendChat,
    setPeerVolume,
    connectionState,
    peers: Array.from(peersMap.values()),
  }
}

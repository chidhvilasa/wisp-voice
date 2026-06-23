import { useCallback, useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { destroyVoiceEngine, getVoiceEngine } from '../lib/rooms'
import { createReconnectScheduler } from '../lib/reconnect'
import { useVoiceStore } from '../store/voiceStore'
import { useSettingsStore } from '../store/settingsStore'
import type { ChatMessage, ConnectionState, Peer, PeerStats } from '../types'

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

  const schedulerRef = useRef<ReturnType<typeof createReconnectScheduler> | null>(null)
  if (!schedulerRef.current) {
    schedulerRef.current = createReconnectScheduler(
      () => {
        const room = lastRoomRef.current
        if (!room) return Promise.resolve()
        return engineRef.current.connect(room.code, room.displayName)
      },
      () => setConnectionState('error'),
    )
  }

  const connect = useCallback(
    async (roomCode: string, displayName: string) => {
      lastRoomRef.current = { code: roomCode, displayName }
      setRoomCode(roomCode)
      setDisplayName(displayName)
      schedulerRef.current?.reset()

      try {
        await engineRef.current.connect(roomCode, displayName)
      } catch {
        schedulerRef.current?.scheduleReconnect()
      }
    },
    [setRoomCode, setDisplayName],
  )

  const disconnect = useCallback(() => {
    schedulerRef.current?.reset()
    lastRoomRef.current = null
    engineRef.current.disconnect()
    resetVoiceStore()
  }, [resetVoiceStore])

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
        schedulerRef.current?.reset()
        const { roomCode, displayName } = useVoiceStore.getState()
        if (roomCode) {
          lastRoomRef.current = { code: roomCode, displayName }
        }
      } else if (state === 'reconnecting') {
        schedulerRef.current?.scheduleReconnect()
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
      schedulerRef.current?.scheduleReconnect()
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
      schedulerRef.current?.cancel()
      destroyVoiceEngine()
    }
  }, [setPeer, removePeer, setConnectionState, addChatMessage])

  useEffect(() => {
    const unsubscribe = useSettingsStore.subscribe((state, prevState) => {
      const engine = engineRef.current
      if (useVoiceStore.getState().connectionState !== 'connected') return

      if (state.noiseSuppression !== prevState.noiseSuppression) {
        engine.setNoiseSuppression(state.noiseSuppression)
      }
      if (state.micVolume !== prevState.micVolume) {
        engine.setMicVolume(state.micVolume)
      }
      if (state.outputVolume !== prevState.outputVolume) {
        engine.setOutputVolume(state.outputVolume)
      }
      if (state.echoCancellation !== prevState.echoCancellation) {
        void engine.setEchoCancellation(state.echoCancellation)
      }
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    const unsubscribe = useSettingsStore.subscribe((state, prevState) => {
      if (state.hotkeys === prevState.hotkeys) return
      void invoke('update_hotkeys', { hotkeys: state.hotkeys }).catch(() => {})
    })

    return unsubscribe
  }, [])

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

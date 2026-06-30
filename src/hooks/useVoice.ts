import { useCallback, useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { getVoiceEngine } from '../lib/rooms'
import { createReconnectScheduler } from '../lib/reconnect'
import { playSound } from '../lib/sounds'
import type { SoundType } from '../lib/sounds'
import { useVoiceStore } from '../store/voiceStore'
import { useSettingsStore } from '../store/settingsStore'
import type { ChatMessage, ConnectionState, Peer, PeerStats } from '../types'

function maybePlaySound(type: SoundType): void {
  if (useSettingsStore.getState().soundEffects) playSound(type)
}

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
  const previousMutedState = useVoiceStore((state) => state.previousMutedState)

  const setRoomCode = useVoiceStore((state) => state.setRoomCode)
  const setDisplayName = useVoiceStore((state) => state.setDisplayName)
  const setPeer = useVoiceStore((state) => state.setPeer)
  const removePeer = useVoiceStore((state) => state.removePeer)
  const setLocalMuted = useVoiceStore((state) => state.setLocalMuted)
  const setLocalDeafened = useVoiceStore((state) => state.setLocalDeafened)
  const setPreviousMutedState = useVoiceStore((state) => state.setPreviousMutedState)
  const setConnectionState = useVoiceStore((state) => state.setConnectionState)
  const addChatMessage = useVoiceStore((state) => state.addChatMessage)
  const setLastError = useVoiceStore((state) => state.setLastError)
  const setTurnUnavailable = useVoiceStore((state) => state.setTurnUnavailable)
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
      setLastError(null)
      setTurnUnavailable(false)
      schedulerRef.current?.reset()

      try {
        await engineRef.current.connect(roomCode, displayName)
      } catch {
        schedulerRef.current?.scheduleReconnect()
      }
    },
    [setRoomCode, setDisplayName, setLastError, setTurnUnavailable],
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
    maybePlaySound(next ? 'mute' : 'unmute')
  }, [localMuted, setLocalMuted])

  const toggleDeafen = useCallback(() => {
    const next = !localDeafened
    engineRef.current.setDeafened(next)
    maybePlaySound(next ? 'mute' : 'unmute')
    if (next) {
      setPreviousMutedState(localMuted)
      setLocalMuted(true)
    } else {
      setLocalMuted(previousMutedState)
    }
    setLocalDeafened(next)
  }, [localDeafened, localMuted, previousMutedState, setLocalDeafened, setLocalMuted, setPreviousMutedState])

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
    const debug = (event: string, ...details: unknown[]) => {
      if (import.meta.env.DEV) console.error(`[wisp:engine] ${event}`, ...details)
    }

    const handlePeerDiscovered = (peerId: string, name: string) => {
      debug('peer-discovered', peerId, name)
      const existing = useVoiceStore.getState().peers.get(peerId)
      setPeer({
        id: peerId,
        name: name || existing?.name || peerId.slice(0, 8),
        muted: existing?.muted ?? false,
        deafened: existing?.deafened ?? false,
        speaking: existing?.speaking ?? false,
        quality: existing?.quality ?? 'good',
        latencyMs: existing?.latencyMs ?? 0,
        connecting: true,
      })
    }

    const handlePeerJoined = (peerId: string) => {
      debug('peer-joined', peerId)
      const existing = useVoiceStore.getState().peers.get(peerId)
      setPeer({
        id: peerId,
        name: existing?.name ?? peerId.slice(0, 8),
        muted: existing?.muted ?? false,
        deafened: existing?.deafened ?? false,
        speaking: existing?.speaking ?? false,
        quality: existing?.quality ?? 'good',
        latencyMs: existing?.latencyMs ?? 0,
        connecting: false,
      })
      maybePlaySound('join')
    }

    const handlePeerLeft = (peerId: string) => {
      debug('peer-left', peerId)
      removePeer(peerId)
      maybePlaySound('leave')
    }

    const handlePeerName = (peerId: string, name: string) => {
      debug('peer-name', peerId, name)
      const peer = useVoiceStore.getState().peers.get(peerId)
      if (peer) {
        setPeer({ ...peer, name })
      }
    }

    const handleSpeaking = (peerId: string, isSpeaking: boolean) => {
      debug('speaking', peerId, isSpeaking)
      const peer = useVoiceStore.getState().peers.get(peerId)
      if (peer) {
        setPeer({ ...peer, speaking: isSpeaking })
      }
    }

    const handlePeerStateUpdate = (peerId: string, muted: boolean, deafened: boolean) => {
      debug('peer-state-update', peerId, muted, deafened)
      const peer = useVoiceStore.getState().peers.get(peerId)
      if (peer) {
        setPeer({ ...peer, muted, deafened })
      }
    }

    const handleConnectionStateChange = (state: ConnectionState) => {
      debug('connection-state-change', state)
      setConnectionState(state)
      if (state === 'connected') {
        setLastError(null)
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
      debug('chat-message', message)
      addChatMessage(message)
      if (message.from !== useVoiceStore.getState().displayName) {
        maybePlaySound('message')
      }
    }

    const handlePeerStats = (stats: Map<string, PeerStats>) => {
      debug('peer-stats', stats)
      for (const [peerId, peerStats] of stats) {
        const peer = useVoiceStore.getState().peers.get(peerId)
        if (peer) {
          setPeer({ ...peer, quality: peerStats.quality, latencyMs: Math.round(peerStats.rttMs) })
        }
      }
    }

    const handleError = (error: Error) => {
      debug('error', error)
      setLastError(error.message)
      schedulerRef.current?.scheduleReconnect()
    }

    const handleTurnUnavailable = () => {
      debug('turn-unavailable')
      setTurnUnavailable(true)
    }

    engine.on('peer-discovered', handlePeerDiscovered)
    engine.on('peer-joined', handlePeerJoined)
    engine.on('peer-left', handlePeerLeft)
    engine.on('peer-name', handlePeerName)
    engine.on('speaking', handleSpeaking)
    engine.on('peer-state-update', handlePeerStateUpdate)
    engine.on('connection-state-change', handleConnectionStateChange)
    engine.on('chat-message', handleChatMessage)
    engine.on('peer-stats', handlePeerStats)
    engine.on('error', handleError)
    engine.on('turn-unavailable', handleTurnUnavailable)

    return () => {
      engine.off('peer-discovered', handlePeerDiscovered)
      engine.off('peer-joined', handlePeerJoined)
      engine.off('peer-left', handlePeerLeft)
      engine.off('peer-name', handlePeerName)
      engine.off('speaking', handleSpeaking)
      engine.off('peer-state-update', handlePeerStateUpdate)
      engine.off('connection-state-change', handleConnectionStateChange)
      engine.off('chat-message', handleChatMessage)
      engine.off('peer-stats', handlePeerStats)
      engine.off('error', handleError)
      engine.off('turn-unavailable', handleTurnUnavailable)
      schedulerRef.current?.cancel()
    }
  }, [setPeer, removePeer, setConnectionState, addChatMessage, setLastError, setTurnUnavailable])

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
    void invoke('update_tray_icon', { muted: localMuted, deafened: localDeafened }).catch(() => {})
  }, [localMuted, localDeafened])

  useEffect(() => {
    let cancelled = false
    const unlistenFns: Array<() => void> = []

    const handleOverlayToggle = () => {
      overlayVisibleRef.current = !overlayVisibleRef.current
      const showing = overlayVisibleRef.current
      // The overlay window now requests its own state refresh via
      // 'overlay-needs-state' once it has actually mounted (see
      // Overlay.tsx), so this push is just a best-effort head start for the
      // common case - it's no longer the only thing standing between the
      // overlay and a blank screen.
      void invoke(showing ? 'show_overlay' : 'hide_overlay')
        .then(() => {
          if (showing) useVoiceStore.getState().republishState()
        })
        .catch(() => {})
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
      // The overlay window requests this itself once it has actually
      // mounted and registered its own listeners (see Overlay.tsx) - more
      // reliable than this window guessing when the overlay is ready.
      'overlay-needs-state': () => useVoiceStore.getState().republishState(),
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

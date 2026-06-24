import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { currentMonitor, getCurrentWindow, PhysicalPosition } from '@tauri-apps/api/window'
import { Lock } from 'lucide-react'
import { useSettingsStore } from '../store/settingsStore'
import { OverlayCompact, OverlayFull } from '../components/wisp/OverlayPreview'
import type { Peer as WispPeer } from '../components/wisp/types'
import type { ConnectionQuality, Peer } from '../types'

const SNAP_PADDING = 16
const AUTO_HIDE_DELAY_MS = 3000
const AUTO_HIDE_FADE_MS = 300
const SPEAKING_FADE_MS = 100

interface SpeakingChangedPayload {
  peerId: string
  speaking: boolean
}

interface OverlayMember {
  id: string
  name: string
  muted: boolean
  speaking: boolean
  quality: ConnectionQuality
  latencyMs: number
  isSelf: boolean
}

function signalFromQuality(quality: ConnectionQuality): 1 | 2 | 3 {
  if (quality === 'good') return 3
  if (quality === 'ok') return 2
  return 1
}

export default function Overlay() {
  const overlayMode = useSettingsStore((state) => state.overlayMode)
  const overlayAutoHide = useSettingsStore((state) => state.overlayAutoHide)
  const overlayOpacity = useSettingsStore((state) => state.overlayOpacity)
  const displayName = useSettingsStore((state) => state.displayName)

  const [peers, setPeers] = useState<Peer[]>([])
  const [localMuted, setLocalMuted] = useState(false)
  const [visible, setVisible] = useState(true)
  const [transitionMs, setTransitionMs] = useState(SPEAKING_FADE_MS)

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDraggingRef = useRef(false)
  const dragCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.()
      dragCleanupRef.current = null
    }
  }, [])

  useEffect(() => {
    let unlistenPeers: (() => void) | undefined
    let unlistenSpeaking: (() => void) | undefined
    let unlistenMute: (() => void) | undefined
    let cancelled = false

    void (async () => {
      try {
        unlistenPeers = await listen<Peer[]>('peers-updated', (event) => {
          setPeers(event.payload)
        })
        unlistenSpeaking = await listen<SpeakingChangedPayload>('speaking-changed', (event) => {
          const { peerId, speaking } = event.payload
          setPeers((prev) => prev.map((peer) => (peer.id === peerId ? { ...peer, speaking } : peer)))
        })
        unlistenMute = await listen<boolean>('mute-changed', (event) => {
          setLocalMuted(event.payload)
        })
      } catch {
        // Tauri event API unavailable outside a Tauri window (browser/dev preview)
      }
      if (cancelled) {
        unlistenPeers?.()
        unlistenSpeaking?.()
        unlistenMute?.()
      }
    })()

    return () => {
      cancelled = true
      unlistenPeers?.()
      unlistenSpeaking?.()
      unlistenMute?.()
    }
  }, [])

  const anySpeaking = peers.some((peer) => peer.speaking)

  useEffect(() => {
    if (!overlayAutoHide) {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
      setVisible(true)
      return
    }

    if (anySpeaking) {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
      setTransitionMs(SPEAKING_FADE_MS)
      setVisible(true)
      return
    }

    hideTimerRef.current = setTimeout(() => {
      setTransitionMs(AUTO_HIDE_FADE_MS)
      setVisible(false)
    }, AUTO_HIDE_DELAY_MS)

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }
  }, [anySpeaking, overlayAutoHide])

  const snapToNearestCorner = useCallback(async () => {
    try {
      const win = getCurrentWindow()
      const [pos, size, monitor] = await Promise.all([
        win.outerPosition(),
        win.outerSize(),
        currentMonitor(),
      ])
      if (!monitor) return

      const screenX = monitor.position.x
      const screenY = monitor.position.y
      const screenWidth = monitor.size.width
      const screenHeight = monitor.size.height

      const centerX = pos.x + size.width / 2
      const centerY = pos.y + size.height / 2
      const isLeft = centerX < screenX + screenWidth / 2
      const isTop = centerY < screenY + screenHeight / 2

      const targetX = isLeft
        ? screenX + SNAP_PADDING
        : screenX + screenWidth - size.width - SNAP_PADDING
      const targetY = isTop
        ? screenY + SNAP_PADDING
        : screenY + screenHeight - size.height - SNAP_PADDING

      await invoke('set_overlay_position', {
        x: Math.round(targetX),
        y: Math.round(targetY),
      })
    } catch {
      // Tauri window API unavailable outside a Tauri window (browser/dev preview)
    }
  }, [])

  const handleMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      const startScreenX = event.screenX
      const startScreenY = event.screenY

      void (async () => {
        try {
          const win = getCurrentWindow()
          const startPos = await win.outerPosition()
          isDraggingRef.current = true

          const handleMove = (moveEvent: MouseEvent) => {
            if (!isDraggingRef.current) return
            const dx = moveEvent.screenX - startScreenX
            const dy = moveEvent.screenY - startScreenY
            void win.setPosition(new PhysicalPosition(startPos.x + dx, startPos.y + dy))
          }

          const detach = () => {
            window.removeEventListener('mousemove', handleMove)
            window.removeEventListener('mouseup', handleUp)
            dragCleanupRef.current = null
          }

          const handleUp = () => {
            isDraggingRef.current = false
            detach()
            void snapToNearestCorner()
          }

          window.addEventListener('mousemove', handleMove)
          window.addEventListener('mouseup', handleUp)
          dragCleanupRef.current = () => {
            isDraggingRef.current = false
            detach()
          }
        } catch {
          // Tauri window API unavailable outside a Tauri window (browser/dev preview)
        }
      })()
    },
    [snapToNearestCorner],
  )

  const members: OverlayMember[] = [
    {
      id: 'self',
      name: displayName || 'You',
      muted: localMuted,
      speaking: false,
      quality: 'good',
      latencyMs: 0,
      isSelf: true,
    },
    ...peers.map((peer) => ({
      id: peer.id,
      name: peer.name,
      muted: peer.muted,
      speaking: peer.speaking,
      quality: peer.quality,
      latencyMs: peer.latencyMs,
      isSelf: false,
    })),
  ]

  const containerStyle = {
    opacity: visible ? overlayOpacity : 0,
    transition: `opacity ${transitionMs}ms ease`,
  }

  const wispMembers: WispPeer[] = members.map((member) => ({
    id: member.id,
    name: member.name,
    isSelf: member.isSelf,
    speaking: member.speaking,
    muted: member.muted,
    signal: signalFromQuality(member.quality),
    latencyMs: member.latencyMs,
  }))

  return (
    <div className="relative h-full w-full" style={containerStyle} onMouseDown={handleMouseDown}>
      {overlayMode === 'full' ? (
        <OverlayFull peers={wispMembers} className="h-full w-full" />
      ) : (
        <OverlayCompact peers={wispMembers} />
      )}
      <Lock className="absolute bottom-1 right-1 h-2 w-2 text-white/40" />
    </div>
  )
}

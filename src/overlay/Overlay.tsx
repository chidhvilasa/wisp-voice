import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { currentMonitor, getCurrentWindow, PhysicalPosition } from '@tauri-apps/api/window'
import { Lock, MicOff } from 'lucide-react'
import { useSettingsStore } from '../store/settingsStore'
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function latencyDotClass(latencyMs: number): string {
  if (latencyMs < 80) return 'bg-speaking'
  if (latencyMs < 200) return 'bg-warning'
  return 'bg-muted'
}

function qualityClass(quality: ConnectionQuality): string {
  if (quality === 'good') return 'bg-speaking'
  if (quality === 'ok') return 'bg-warning'
  return 'bg-muted'
}

function SignalBars({ quality }: { quality: ConnectionQuality }) {
  const color = qualityClass(quality)
  return (
    <div className="flex items-end gap-[1px]">
      <span className={`h-1 w-[2px] ${color}`} />
      <span className={`h-1.5 w-[2px] ${color}`} />
      <span className={`h-2 w-[2px] ${color}`} />
    </div>
  )
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

          const handleUp = () => {
            isDraggingRef.current = false
            window.removeEventListener('mousemove', handleMove)
            window.removeEventListener('mouseup', handleUp)
            void snapToNearestCorner()
          }

          window.addEventListener('mousemove', handleMove)
          window.addEventListener('mouseup', handleUp)
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

  if (overlayMode === 'full') {
    return (
      <div
        className="flex h-full w-full flex-col gap-1.5 rounded-2xl bg-surface/90 p-2"
        style={containerStyle}
        onMouseDown={handleMouseDown}
      >
        {members.map((member) => (
          <div key={member.id} className="flex items-center gap-2 rounded-card bg-surface2/80 p-1.5">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-surface2 text-xs font-semibold text-text-primary">
              {!member.isSelf && (
                <span
                  className={
                    member.speaking && !member.muted
                      ? 'absolute inset-[-3px] rounded-full animate-[wisp-pulse_1.2s_ease-in-out_infinite]'
                      : 'absolute inset-[-3px] rounded-full opacity-0'
                  }
                />
              )}
              {member.muted ? (
                <MicOff className="relative h-4 w-4 text-muted" />
              ) : (
                <span className="relative">{initials(member.name)}</span>
              )}
            </div>
            <div className="flex flex-1 flex-col overflow-hidden">
              <span className="truncate text-xs font-medium text-text-primary">{member.name}</span>
              {!member.isSelf && (
                <div className="flex items-center gap-1">
                  <SignalBars quality={member.quality} />
                  <span className="text-[10px] text-text-secondary">{member.latencyMs}ms</span>
                </div>
              )}
            </div>
          </div>
        ))}
        <Lock className="absolute bottom-1 right-1 h-2 w-2 text-text-secondary" />
      </div>
    )
  }

  return (
    <div
      className="relative flex h-full w-full items-center justify-center gap-2 rounded-2xl bg-surface/80 p-3"
      style={containerStyle}
      onMouseDown={handleMouseDown}
    >
      {members.map((member) => (
        <div
          key={member.id}
          className={
            'relative flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-medium text-text-primary ' +
            (member.muted
              ? 'bg-muted'
              : member.speaking
                ? 'bg-speaking animate-[wisp-pulse_1.2s_ease-in-out_infinite]'
                : 'bg-surface2')
          }
        >
          {member.muted ? <MicOff className="h-3.5 w-3.5 text-white" /> : initials(member.name)}
          {!member.isSelf && (
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-[3px] w-[3px] rounded-full ${latencyDotClass(member.latencyMs)}`}
            />
          )}
        </div>
      ))}
      <Lock className="absolute bottom-1 right-1 h-2 w-2 text-text-secondary" />
    </div>
  )
}

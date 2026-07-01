import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Bug,
  Check,
  Headphones,
  HeadphoneOff,
  Lock,
  LogOut,
  Mic,
  MicOff,
  MessageCircle,
  Loader2,
  Settings as SettingsIcon,
  Unlock,
  X,
} from 'lucide-react'
import { useVoice } from '../hooks/useVoice'
import { useVAD } from '../hooks/useVAD'
import { useVoiceStore } from '../store/voiceStore'
import { getVoiceEngine, lockRoom } from '../lib/rooms'
import type { WispVoiceEngine } from '../lib/webrtc'
import { cn } from '../lib/utils'
import { getFriends } from '../lib/friends'
import type { Friend } from '../lib/friends'
import { presenceClient } from '../lib/presence'
import MicMeter from '../components/MicMeter'
import { PerformanceButton } from '../components/PerformanceButton'
import Settings from './Settings'
import { PeerCard } from '../components/wisp/PeerCard'
import { ConnectionStatus } from '../components/wisp/ConnectionStatus'
import { ChatPanel } from '../components/wisp/ChatPanel'
import { Avatar } from '../components/wisp/Avatar'
import type { Peer as WispPeer, ChatMessage as WispChatMessage } from '../components/wisp/types'
import type { ConnectionQuality, Peer } from '../types'

function navigate(path: string): void {
  window.location.hash = path
}

type PeerDebugInfo = ReturnType<WispVoiceEngine['getDebugInfo']>[number]

function isMicPermissionError(error: string | null): boolean {
  if (!error) return false
  const lower = error.toLowerCase()
  return lower.includes('microphone') || lower.includes('permission')
}

function troubleshootingFor(error: string | null): string {
  if (!error) return 'Something went wrong. Please try again.'
  const lower = error.toLowerCase()
  if (lower.includes('ice') || lower.includes('firewall') || lower.includes('p2p')) {
    return 'Could not establish P2P connection. Both devices may be behind strict firewalls. Try: both users disable VPN, or connect to the same WiFi.'
  }
  if (lower.includes('microphone')) {
    return 'Microphone access denied. Grant permission in system settings.'
  }
  if (lower.includes('room')) {
    return 'Room not found or expired. Create a new room.'
  }
  return error
}

function signalFromQuality(quality: ConnectionQuality): 1 | 2 | 3 {
  if (quality === 'good') return 3
  if (quality === 'ok') return 2
  return 1
}

interface GridConfig {
  columns: string
  maxWidth: number
  avatarSize: 60 | 68 | 80
  gap: number
  minHeight: number
}

function getGridConfig(count: number): GridConfig {
  if (count <= 2) return { columns: 'repeat(2, 1fr)', maxWidth: 720, avatarSize: 80, gap: 24, minHeight: 220 }
  if (count === 3) return { columns: 'repeat(3, 1fr)', maxWidth: 900, avatarSize: 68, gap: 16, minHeight: 200 }
  return { columns: 'repeat(2, 1fr)', maxWidth: 680, avatarSize: 60, gap: 16, minHeight: 180 }
}

export default function Room() {
  const { connect, disconnect, toggleMute, toggleDeafen, sendChat, setPeerVolume, connectionState, peers } =
    useVoice()

  const roomCode = useVoiceStore((state) => state.roomCode)
  const displayName = useVoiceStore((state) => state.displayName)
  const localMuted = useVoiceStore((state) => state.localMuted)
  const localDeafened = useVoiceStore((state) => state.localDeafened)
  const localSpeaking = useVoiceStore((state) => state.localSpeaking)
  const isHost = useVoiceStore((state) => state.isHost)
  const chatMessages = useVoiceStore((state) => state.chatMessages)
  const lastError = useVoiceStore((state) => state.lastError)
  const [micBannerDismissed, setMicBannerDismissed] = useState(false)
  useEffect(() => {
    setMicBannerDismissed(false)
  }, [lastError])

  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  useEffect(() => {
    if (connectionState === 'connected') {
      setLocalStream(getVoiceEngine().getOutgoingStream())
    }
  }, [connectionState])
  const { analyser } = useVAD(localStream)

  const [locked, setLocked] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [friends, setFriends] = useState<Friend[]>([])
  const [inviteStatus, setInviteStatus] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'offline'>>({})
  useEffect(() => {
    if (showShare) setFriends(getFriends())
  }, [showShare])
  const handleInviteFriend = useCallback(
    async (friend: Friend) => {
      setInviteStatus((prev) => ({ ...prev, [friend.wispId]: 'sending' }))
      const delivered = await presenceClient.sendInvite(friend.wispId, displayName || 'Guest', roomCode)
      setInviteStatus((prev) => ({ ...prev, [friend.wispId]: delivered ? 'sent' : 'offline' }))
      setTimeout(() => {
        setInviteStatus((prev) => ({ ...prev, [friend.wispId]: 'idle' }))
      }, 3000)
    },
    [displayName, roomCode],
  )
  const [unreadCount, setUnreadCount] = useState(0)
  const lastSeenMessageCountRef = useRef(0)
  useEffect(() => {
    if (showChat) {
      lastSeenMessageCountRef.current = chatMessages.length
      setUnreadCount(0)
      return
    }
    const newMessages = chatMessages.slice(lastSeenMessageCountRef.current)
    const newRemoteCount = newMessages.filter((message) => message.from !== displayName).length
    if (newRemoteCount > 0) {
      setUnreadCount((prev) => prev + newRemoteCount)
    }
    lastSeenMessageCountRef.current = chatMessages.length
  }, [chatMessages, showChat, displayName])
  const [showDebug, setShowDebug] = useState(false)
  const [copied, setCopied] = useState(false)
  const [volumes, setVolumes] = useState<Record<string, number>>({})

  const [debugInfo, setDebugInfo] = useState<PeerDebugInfo[]>([])
  useEffect(() => {
    if (!showDebug) return
    const update = () => setDebugInfo(getVoiceEngine().getDebugInfo())
    update()
    const intervalId = setInterval(update, 1000)
    return () => clearInterval(intervalId)
  }, [showDebug])

  const handleCopyCode = useCallback(() => {
    void navigator.clipboard
      .writeText(roomCode)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {})
  }, [roomCode])

  const handleLockToggle = useCallback(() => {
    lockRoom()
    setLocked((prev) => !prev)
  }, [])

  const handleLeave = useCallback(() => {
    disconnect()
    navigate('/')
  }, [disconnect])

  const handleRetry = useCallback(() => {
    void connect(roomCode, displayName)
  }, [connect, roomCode, displayName])

  const handleRejoin = useCallback(() => {
    disconnect()
    void connect(roomCode, displayName)
  }, [connect, disconnect, roomCode, displayName])

  const selfName = displayName || 'You'

  const wispPeers: WispPeer[] = [
    {
      id: 'self',
      name: selfName,
      isSelf: true,
      muted: localMuted,
      deafened: localDeafened,
      speaking: localSpeaking,
      signal: 3,
    },
    ...peers.map((peer: Peer) => ({
      id: peer.id,
      name: peer.name,
      muted: peer.muted,
      deafened: peer.deafened,
      speaking: peer.speaking,
      signal: signalFromQuality(peer.quality),
      latencyMs: peer.latencyMs,
      connecting: peer.connecting,
    })),
  ]

  const wispMessages: WispChatMessage[] = chatMessages.map((message) => ({
    id: message.id,
    authorId: message.from,
    authorName: message.from,
    text: message.content,
    timestamp: message.timestamp,
  }))

  const handleVolumeChange = useCallback(
    (peerId: string, volume: number) => {
      setVolumes((prev) => ({ ...prev, [peerId]: volume }))
      if (peerId !== 'self') setPeerVolume(peerId, volume / 100)
    },
    [setPeerVolume],
  )

  const alone = peers.length === 0
  const gridConfig = getGridConfig(wispPeers.length)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg text-text-primary">
      <div className="relative flex h-full w-full flex-1">
        <div className="flex h-full w-full flex-1 flex-col">
          {connectionState === 'reconnecting' && (
            <div className="flex items-center justify-center gap-2 bg-warning/20 px-4 py-2 text-sm text-warning">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reconnecting...
            </div>
          )}
          {connectionState === 'error' && isMicPermissionError(lastError) && !micBannerDismissed ? (
            <div className="flex items-center justify-center gap-3 bg-muted-red/20 px-4 py-2 text-sm text-muted-red">
              <MicOff className="h-4 w-4 flex-shrink-0" />
              <span>
                Microphone access denied. Go to System Settings → Privacy &amp; Security → Microphone and
                enable Wisp, then rejoin.
              </span>
              <button
                type="button"
                onClick={handleRejoin}
                className="flex-shrink-0 rounded bg-muted-red/30 px-2 py-1 text-xs font-medium text-text-primary hover:bg-muted-red/40"
              >
                Rejoin
              </button>
              <button
                type="button"
                onClick={() => setMicBannerDismissed(true)}
                aria-label="Dismiss"
                className="flex-shrink-0 rounded p-0.5 hover:bg-muted-red/40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            connectionState === 'error' && (
              <div className="flex items-center justify-center gap-3 bg-muted-red/20 px-4 py-2 text-sm text-muted-red">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{troubleshootingFor(lastError)}</span>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="flex-shrink-0 rounded bg-muted-red/30 px-2 py-1 text-xs font-medium text-text-primary hover:bg-muted-red/40"
                >
                  Retry
                </button>
              </div>
            )
          )}
          <header className="relative flex h-[52px] items-center justify-between border-b border-border bg-surface px-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleLeave}
                aria-label="Leave room"
                className="grid h-8 w-8 place-items-center rounded-md text-text-secondary hover:bg-surface2"
              >
                <ArrowLeft size={16} />
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowShare((prev) => !prev)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs transition-colors hover:border-accent hover:text-accent"
                >
                  Invite
                </button>

                {showShare && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowShare(false)} />
                    <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-card border border-border bg-surface p-4 shadow-lg">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        Invite to room
                      </p>
                      {friends.length === 0 ? (
                        <p className="py-2 text-xs text-text-tertiary">
                          No friends added yet. Add friends in Settings.
                        </p>
                      ) : (
                        <ul className="mb-3 flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                          {friends.map((friend) => {
                            const status = inviteStatus[friend.wispId] ?? 'idle'
                            return (
                              <li key={friend.wispId} className="flex items-center gap-2 rounded-lg p-1.5">
                                <Avatar id={friend.wispId} name={friend.name} size={28} />
                                <span className="flex-1 truncate text-sm">{friend.name}</span>
                                <span
                                  className={cn(
                                    'h-1.5 w-1.5 rounded-full',
                                    friend.online ? 'bg-speaking' : 'bg-text-tertiary/40',
                                  )}
                                />
                                <button
                                  type="button"
                                  onClick={() => void handleInviteFriend(friend)}
                                  disabled={status === 'sending'}
                                  className={cn(
                                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                                    status === 'sent'
                                      ? 'bg-speaking/15 text-speaking'
                                      : status === 'offline'
                                        ? 'bg-text-tertiary/15 text-text-tertiary'
                                        : 'bg-accent text-primary-foreground hover:bg-accent-hover',
                                  )}
                                >
                                  {status === 'sent' ? (
                                    <span className="flex items-center gap-1">
                                      <Check size={12} /> Sent
                                    </span>
                                  ) : status === 'offline' ? (
                                    'Offline'
                                  ) : status === 'sending' ? (
                                    '...'
                                  ) : (
                                    'Invite'
                                  )}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )}

                      <div className="border-t border-border pt-3">
                        <p className="mb-2 text-xs text-text-secondary">Share room code:</p>
                        <p className="mb-3 text-center text-2xl font-mono tracking-widest text-text-primary">
                          {roomCode}
                        </p>
                        <button
                          type="button"
                          onClick={handleCopyCode}
                          className="w-full rounded-card bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
                        >
                          {copied ? 'Copied!' : 'Copy code'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <ConnectionStatus />
            </div>

            <div className="flex items-center gap-2">
              {isHost && (
                <button
                  type="button"
                  onClick={handleLockToggle}
                  aria-label={locked ? 'Unlock room' : 'Lock room'}
                  className="grid h-8 w-8 place-items-center rounded-md text-text-tertiary hover:bg-surface2"
                >
                  {locked ? <Lock size={14} /> : <Unlock size={14} />}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowDebug((prev) => !prev)}
                aria-label="Toggle debug panel"
                className={`grid h-8 w-8 place-items-center rounded-md hover:bg-surface2 ${
                  showDebug ? 'text-accent' : 'text-text-tertiary'
                }`}
              >
                <Bug size={14} />
              </button>
              <span className="rounded-full bg-surface2 px-2.5 py-1 font-mono text-xs text-text-secondary">
                {wispPeers.length}/4
              </span>
            </div>
          </header>

          <div className="flex flex-1 overflow-hidden">
            <div className="grid flex-1 place-items-center overflow-y-auto p-8 pb-[90px]">
              {alone ? (
                <div className="flex w-full max-w-[400px] flex-col items-center gap-5">
                  <div className="flex min-h-[280px] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-accent/40 bg-surface p-6 animate-border-pulse-subtle">
                    <Avatar id="self" name={selfName} size={120} />
                    <span className="text-lg font-medium">{selfName}</span>
                    <span className="text-sm text-text-tertiary">Waiting for friends to join...</span>
                  </div>
                  <span className="text-sm text-text-tertiary">Use the Invite button to bring friends in</span>
                </div>
              ) : (
                <div
                  className="grid w-full"
                  style={{
                    gridTemplateColumns: gridConfig.columns,
                    maxWidth: gridConfig.maxWidth,
                    gap: gridConfig.gap,
                    transition: 'grid-template-columns 300ms ease',
                  }}
                >
                  {wispPeers.map((peer) => (
                    <PeerCard
                      key={peer.id}
                      peer={peer}
                      avatarSize={gridConfig.avatarSize}
                      minHeight={gridConfig.minHeight}
                      volume={volumes[peer.id] ?? 100}
                      onVolumeChange={(v) => handleVolumeChange(peer.id, v)}
                    />
                  ))}
                </div>
              )}

              {connectionState === 'connecting' && (
                <div className="mt-6 flex w-full max-w-xs flex-col gap-2 rounded-card border border-border bg-surface p-4 text-sm">
                  <span className="mb-1 font-medium text-text-primary">Establishing connection...</span>
                  <div className="flex items-center gap-2 text-text-secondary">
                    <Check size={14} className="text-speaking" />
                    <span>Connected to server</span>
                  </div>
                  <div className="flex items-center gap-2 text-text-secondary">
                    <Loader2 size={14} className="animate-spin" />
                    <span>Exchanging connection info...</span>
                  </div>
                  <div className="flex items-center gap-2 text-text-secondary">
                    <Loader2 size={14} className="animate-spin" />
                    <span>Finding network path...</span>
                  </div>
                </div>
              )}

              {showDebug && (
                <div className="mt-6 w-full max-w-sm rounded-card border border-border bg-[#0A0A0C] p-3 font-mono text-[11px] text-text-secondary">
                  <div>connectionState: {connectionState}</div>
                  <div>peers.size: {peers.length}</div>
                  <div>localPeerId: {(getVoiceEngine().getSelfId() ?? '').slice(0, 6) || '(none)'}</div>
                  <div className="mt-2 border-t border-border pt-2">
                    {debugInfo.length === 0 ? (
                      <div>(no peer connections)</div>
                    ) : (
                      debugInfo.map((d) => (
                        <div key={d.peerId} className="mb-1.5">
                          <div>{d.peerId.slice(0, 6)}:</div>
                          <div className="pl-2">connectionState={d.connectionState}</div>
                          <div className="pl-2">iceConnectionState={d.iceConnectionState}</div>
                          <div className="pl-2">iceGatheringState={d.iceGatheringState}</div>
                          <div className="pl-2">signalingState={d.signalingState}</div>
                          <div className="pl-2">candidates={d.candidateCount}</div>
                          <div className="pl-2">relayFound={String(d.hasRelayCandidate)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <ChatPanel
              open={showChat}
              onClose={() => setShowChat(false)}
              messages={wispMessages}
              onSend={sendChat}
              self={{ id: selfName, name: selfName, isSelf: true }}
            />
          </div>

          <MicMeter analyser={analyser} isMuted={localMuted} />
        </div>

        {/* Floating user panel: centered at the bottom, width scales with the app window.
            flex-wrap/white-space/min-width/overflow keep this a single row at all sizes -
            it only ever overflows the window edges once the window is narrower than the
            bar's own content, instead of wrapping or squishing internally. */}
        <div
          className="fixed bottom-4 left-1/2 z-30 flex flex-nowrap -translate-x-1/2 items-center justify-between gap-3 whitespace-nowrap rounded-[14px] px-3.5 py-2 shadow-[0_6px_20px_rgba(0,0,0,0.5)]"
          style={{
            background: '#1A1A1E',
            border: '1px solid rgba(255,255,255,0.08)',
            width: 'clamp(280px, 26vw, 460px)',
            minWidth: 'fit-content',
            overflow: 'visible',
          }}
        >
          <div className="flex shrink-0 items-center gap-2.5">
            <Avatar id="self" name={selfName} size={32} />
            <div className="text-xs">
              <div
                className="truncate font-semibold text-white"
                style={{ maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {selfName}
              </div>
              <div className="flex items-center gap-1.5 text-text-tertiary">
                <span className={`h-1.5 w-1.5 rounded-full ${localMuted ? 'bg-muted-red' : 'bg-speaking'}`} />
                <span>In room</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <span className="mr-1 h-6 w-px shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }} />

            <button
              type="button"
              onClick={toggleMute}
              aria-label={localMuted ? 'Unmute' : 'Mute'}
              className={cn(
                'grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors',
                localMuted ? 'bg-muted-red text-white' : 'bg-transparent text-white hover:bg-white/10',
              )}
            >
              {localMuted ? <MicOff size={15} /> : <Mic size={15} />}
            </button>
            <button
              type="button"
              onClick={toggleDeafen}
              aria-label={localDeafened ? 'Undeafen' : 'Deafen'}
              className={cn(
                'grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors',
                localDeafened ? 'bg-muted-red text-white' : 'bg-transparent text-white hover:bg-white/10',
              )}
            >
              {localDeafened ? <HeadphoneOff size={15} /> : <Headphones size={15} />}
            </button>
            <div className="relative inline-flex shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowChat((prev) => !prev)
                  setUnreadCount(0)
                }}
                aria-label="Chat"
                className={cn(
                  'grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors',
                  showChat ? 'bg-accent text-primary-foreground' : 'bg-transparent text-white hover:bg-white/10',
                )}
              >
                <MessageCircle size={15} />
              </button>
              {unreadCount > 0 && (
                <span className="animate-badge-pop absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#EF4444] px-1 text-[11px] font-bold leading-none text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <PerformanceButton />
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              aria-label="Settings"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-transparent text-white transition-colors hover:bg-white/10"
            >
              <SettingsIcon size={15} />
            </button>
            <button
              type="button"
              onClick={handleLeave}
              aria-label="Leave"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white transition-colors"
              style={{ background: '#EF4444' }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>

        {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      </div>
    </div>
  )
}

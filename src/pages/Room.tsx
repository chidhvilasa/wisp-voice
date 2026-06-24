import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  Copy,
  Headphones,
  HeadphoneOff,
  Lock,
  LogOut,
  Mic,
  MicOff,
  MessageSquare,
  Send,
  Loader2,
  Settings as SettingsIcon,
  Share2,
  Unlock,
} from 'lucide-react'
import { useVoice } from '../hooks/useVoice'
import { useVAD } from '../hooks/useVAD'
import { useVoiceStore } from '../store/voiceStore'
import { getVoiceEngine, lockRoom } from '../lib/rooms'
import { getPeerColor } from '../lib/peerColor'
import MicMeter from '../components/MicMeter'
import Settings from './Settings'
import type { ConnectionQuality, ConnectionState, Peer } from '../types'

function navigate(path: string): void {
  window.location.hash = path
}

function initial(name: string): string {
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed[0]!.toUpperCase() : '?'
}

function qualityColor(quality: ConnectionQuality): string {
  if (quality === 'good') return 'bg-speaking'
  if (quality === 'ok') return 'bg-warning'
  return 'bg-muted'
}

function latencyColor(latencyMs: number): string {
  if (latencyMs < 80) return 'text-speaking'
  if (latencyMs <= 200) return 'text-warning'
  return 'text-muted'
}

function SignalBars({ quality }: { quality: ConnectionQuality }) {
  const color = qualityColor(quality)
  return (
    <div className="flex items-end gap-[2px]">
      <span className={`h-2.5 w-[3px] rounded-sm ${color}`} />
      <span className={`h-2.5 w-[3px] rounded-sm ${color}`} />
      <span className={`h-2.5 w-[3px] rounded-sm ${color}`} />
    </div>
  )
}

interface ConnectionStatusProps {
  connectionState: ConnectionState
  peers: Peer[]
}

function ConnectionStatus({ connectionState, peers }: ConnectionStatusProps) {
  const [expanded, setExpanded] = useState(false)

  let dotColor = 'bg-text-secondary'
  let label = 'Connecting...'

  if (connectionState === 'connected') {
    if (peers.some((peer) => peer.quality === 'poor')) {
      dotColor = 'bg-muted'
      label = 'Poor connection'
    } else if (peers.some((peer) => peer.quality === 'ok')) {
      dotColor = 'bg-warning'
      label = 'Some lag'
    } else {
      dotColor = 'bg-speaking'
      label = 'Connected'
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-1.5 rounded-card px-1.5 py-1 text-xs text-text-secondary hover:text-text-primary"
      >
        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
        {label}
      </button>

      {expanded && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setExpanded(false)} />
          <div className="absolute left-0 top-full z-20 mt-2 w-48 rounded-card border border-border bg-surface p-3 shadow-lg">
            {peers.length === 0 ? (
              <p className="text-xs text-text-secondary">No peers connected</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {peers.map((peer) => (
                  <div key={peer.id} className="flex items-center justify-between text-xs">
                    <span className="truncate text-text-primary">{peer.name || 'Unknown'}</span>
                    <span className={latencyColor(peer.latencyMs)}>{peer.latencyMs}ms</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

interface PeerCardProps {
  member: {
    id: string
    name: string
    muted: boolean
    deafened: boolean
    speaking: boolean
    quality: ConnectionQuality
    latencyMs: number
    isSelf: boolean
  }
  onVolumeChange?: (peerId: string, volume: number) => void
}

function PeerCard({ member, onVolumeChange }: PeerCardProps) {
  const [volume, setVolume] = useState(100)
  const avatarColor = getPeerColor(member.id)

  return (
    <div
      className={`group relative flex aspect-square flex-col items-center justify-center gap-2 rounded-card border bg-surface p-5 ${
        member.isSelf ? 'border-accent/50' : 'border-border'
      }`}
    >
      <div
        className="relative flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white"
        style={{
          backgroundColor: avatarColor,
          boxShadow: member.speaking ? '0 0 0 3px #22C55E' : '0 0 0 0px transparent',
          transition: 'box-shadow 150ms ease',
        }}
      >
        <span>{initial(member.name)}</span>
        {member.deafened && (
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-muted ring-2 ring-surface">
            <HeadphoneOff className="h-3 w-3 text-white" />
          </span>
        )}
      </div>

      <span className="w-full truncate text-center text-[13px] font-medium text-text-primary">
        {member.name || 'Unknown'}
        {member.isSelf && <span className="text-text-secondary"> (You)</span>}
      </span>

      <div className="flex items-center gap-2 text-text-secondary">
        {member.muted ? (
          <MicOff className="h-3.5 w-3.5 text-muted" />
        ) : (
          <Mic className="h-3.5 w-3.5 text-speaking" />
        )}
        {member.deafened ? (
          <HeadphoneOff className="h-3.5 w-3.5 text-muted" />
        ) : (
          <Headphones className="h-3.5 w-3.5" />
        )}
        {!member.isSelf && <SignalBars quality={member.quality} />}
        {!member.isSelf && <span className="text-[11px] text-text-secondary">{member.latencyMs}ms</span>}
      </div>

      {!member.isSelf && onVolumeChange && (
        <div className="absolute inset-x-3 bottom-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <input
            type="range"
            min={0}
            max={200}
            value={volume}
            onChange={(event) => {
              const next = Number(event.target.value)
              setVolume(next)
              onVolumeChange(member.id, next / 100)
            }}
            className="w-full accent-accent"
          />
        </div>
      )}
    </div>
  )
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
  const [chatInput, setChatInput] = useState('')
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const linkCopiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages.length])

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) clearTimeout(copiedTimeoutRef.current)
      if (linkCopiedTimeoutRef.current !== null) clearTimeout(linkCopiedTimeoutRef.current)
    }
  }, [])

  const handleCopyCode = useCallback(() => {
    void navigator.clipboard
      .writeText(roomCode)
      .then(() => {
        setCopied(true)
        if (copiedTimeoutRef.current !== null) clearTimeout(copiedTimeoutRef.current)
        copiedTimeoutRef.current = setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }, [roomCode])

  const handleCopyInviteLink = useCallback(() => {
    void navigator.clipboard
      .writeText(`Join my Wisp room with code: ${roomCode}`)
      .then(() => {
        setLinkCopied(true)
        if (linkCopiedTimeoutRef.current !== null) clearTimeout(linkCopiedTimeoutRef.current)
        linkCopiedTimeoutRef.current = setTimeout(() => setLinkCopied(false), 1500)
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

  const handleSendChat = useCallback(() => {
    const content = chatInput.trim()
    if (!content) return
    sendChat(content)
    setChatInput('')
  }, [chatInput, sendChat])

  const members: PeerCardProps['member'][] = [
    {
      id: 'self',
      name: displayName || 'You',
      muted: localMuted,
      deafened: localDeafened,
      speaking: localSpeaking,
      quality: 'good',
      latencyMs: 0,
      isSelf: true,
    },
    ...peers.map((peer: Peer) => ({
      id: peer.id,
      name: peer.name,
      muted: peer.muted,
      deafened: peer.deafened,
      speaking: peer.speaking,
      quality: peer.quality,
      latencyMs: peer.latencyMs,
      isSelf: false,
    })),
  ]

  const toolbarButton =
    'flex h-11 w-11 items-center justify-center rounded-full text-text-primary transition-[filter] duration-150 hover:brightness-[1.15]'

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-text-primary">
      <div className="relative flex h-full w-full flex-1">
        <div className="flex h-full w-full flex-1 flex-col">
          {connectionState === 'reconnecting' && (
            <div className="flex items-center justify-center gap-2 bg-warning/20 px-4 py-2 text-sm text-warning">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reconnecting...
            </div>
          )}
          {connectionState === 'error' && (
            <div className="flex items-center justify-center gap-3 bg-muted/20 px-4 py-2 text-sm text-muted">
              <AlertCircle className="h-4 w-4" />
              Connection lost.
              <button
                type="button"
                onClick={handleRetry}
                className="rounded bg-muted/30 px-2 py-1 text-xs font-medium text-text-primary hover:bg-muted/40"
              >
                Retry
              </button>
            </div>
          )}

          <div className="flex h-12 items-center gap-3 px-4">
            <span className="font-mono text-lg tracking-widest text-text-primary">{roomCode}</span>
            <button
              type="button"
              onClick={handleCopyCode}
              aria-label="Copy room code"
              className="rounded p-1.5 text-text-secondary hover:text-text-primary"
            >
              {copied ? <Check className="h-4 w-4 text-speaking" /> : <Copy className="h-4 w-4" />}
            </button>

            <ConnectionStatus connectionState={connectionState} peers={peers} />

            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowShare((prev) => !prev)}
                  aria-label="Share room code"
                  className="flex items-center gap-1.5 rounded-card border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Share
                </button>

                {showShare && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowShare(false)} />
                    <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-card border border-border bg-surface p-4 shadow-lg">
                      <p className="mb-2 text-xs text-text-secondary">Share this code with friends to join:</p>
                      <p className="mb-3 text-center text-2xl font-mono tracking-widest text-text-primary">
                        {roomCode}
                      </p>
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={handleCopyCode}
                          className="rounded-card bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
                        >
                          {copied ? 'Copied!' : 'Copy code'}
                        </button>
                        <button
                          type="button"
                          onClick={handleCopyInviteLink}
                          className="rounded-card border border-border px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface2"
                        >
                          {linkCopied ? 'Copied!' : 'Copy invite link'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {isHost && (
                <button
                  type="button"
                  onClick={handleLockToggle}
                  className="flex items-center gap-1.5 rounded-card border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
                >
                  {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                  {locked ? 'Locked' : 'Lock Room'}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center p-6">
            <div className="grid w-full max-w-[560px] grid-cols-2 gap-4">
              {members.slice(0, 4).map((member) => (
                <PeerCard key={member.id} member={member} onVolumeChange={setPeerVolume} />
              ))}
            </div>
          </div>

          <div className="px-4">
            <MicMeter analyser={analyser} isMuted={localMuted} />
          </div>

          <div className="flex h-16 w-full items-center justify-center gap-3 px-4">
            <button
              type="button"
              onClick={toggleMute}
              aria-label="Toggle mute"
              className={`${toolbarButton} ${localMuted ? 'bg-muted text-white' : 'bg-surface2'}`}
            >
              {localMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>

            <button
              type="button"
              onClick={toggleDeafen}
              aria-label="Toggle deafen"
              className={`${toolbarButton} ${localDeafened ? 'bg-muted text-white' : 'bg-surface2'}`}
            >
              {localDeafened ? <HeadphoneOff className="h-5 w-5" /> : <Headphones className="h-5 w-5" />}
            </button>

            <button
              type="button"
              onClick={() => setShowChat((prev) => !prev)}
              aria-label="Toggle chat"
              className={`${toolbarButton} ${showChat ? 'bg-accent text-white' : 'bg-surface2'}`}
            >
              <MessageSquare className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => setShowSettings(true)}
              aria-label="Open settings"
              className={`${toolbarButton} bg-surface2`}
            >
              <SettingsIcon className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={handleLeave}
              aria-label="Leave room"
              className={`${toolbarButton} bg-muted text-white`}
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div
          className={`flex w-72 flex-col border-l border-border bg-surface transition-all duration-200 ${
            showChat ? 'translate-x-0' : 'translate-x-full'
          } ${showChat ? 'relative' : 'absolute right-0 top-0 h-full'}`}
        >
          <div className="flex-1 overflow-y-auto p-3">
            {chatMessages.map((message) => (
              <div key={message.id} className="mb-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-accent">{message.from}</span>
                  <span className="text-[10px] text-text-secondary">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm text-text-primary">{message.content}</p>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="flex gap-2 border-t border-border p-3">
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSendChat()
              }}
              placeholder="Message..."
              className="flex-1 rounded-card border border-border bg-surface2 px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={handleSendChat}
              aria-label="Send message"
              className="flex items-center justify-center rounded-card bg-accent px-2.5 text-white hover:bg-accent-hover"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>

        {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      </div>
    </div>
  )
}

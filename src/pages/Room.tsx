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
import Settings from './Settings'
import type { ConnectionQuality, Peer } from '../types'

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

function SignalBars({ quality }: { quality: ConnectionQuality }) {
  const color = qualityColor(quality)
  return (
    <div className="flex items-end gap-[2px]">
      <span className={`h-1.5 w-[3px] rounded-sm ${color}`} />
      <span className={`h-2.5 w-[3px] rounded-sm ${color}`} />
      <span className={`h-3.5 w-[3px] rounded-sm ${color}`} />
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
  const avatarColor = member.isSelf ? '#7C5CFC' : getPeerColor(member.id)
  const isSpeakingRing = member.speaking && !member.muted

  return (
    <div
      className={`group relative flex aspect-square flex-col items-center justify-center gap-2 rounded-card border bg-surface p-4 ${
        member.isSelf ? 'border-accent/50' : 'border-border'
      }`}
    >
      <div
        className={`relative flex h-16 w-16 items-center justify-center rounded-full text-lg font-semibold text-white ${
          isSpeakingRing ? 'animate-[wisp-pulse_1.2s_ease-in-out_infinite]' : ''
        }`}
        style={{
          backgroundColor: avatarColor,
          boxShadow: isSpeakingRing ? '0 0 0 3px #22C55E' : undefined,
        }}
      >
        <span>{initial(member.name)}</span>
        {member.deafened && (
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-muted ring-2 ring-surface">
            <HeadphoneOff className="h-3 w-3 text-white" />
          </span>
        )}
      </div>

      <span className="w-full truncate text-center text-sm font-medium text-text-primary">
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
        {!member.isSelf && <span className="text-[11px]">{member.latencyMs}ms</span>}
      </div>

      {!member.isSelf && onVolumeChange && (
        <div className="absolute inset-x-3 bottom-1 hidden group-hover:block">
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
  useVAD(localStream)

  const [locked, setLocked] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const chatEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages.length])

  const handleCopyCode = useCallback(() => {
    void navigator.clipboard
      .writeText(roomCode)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }, [roomCode])

  const handleCopyInviteLink = useCallback(() => {
    void navigator.clipboard
      .writeText(`Join my Wisp room with code: ${roomCode}`)
      .then(() => {
        setLinkCopied(true)
        setTimeout(() => setLinkCopied(false), 1500)
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

  const toolbarButton = 'flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-150'

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-background text-text-primary">
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

        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-mono tracking-widest text-text-primary">{roomCode}</span>
            <button
              type="button"
              onClick={handleCopyCode}
              aria-label="Copy room code"
              className="rounded p-1.5 text-text-secondary hover:text-text-primary"
            >
              {copied ? <Check className="h-4 w-4 text-speaking" /> : <Copy className="h-4 w-4" />}
            </button>

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
                  <div className="absolute left-0 top-full z-20 mt-2 w-64 rounded-card border border-border bg-surface p-4 shadow-lg">
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

        <div className="flex flex-1 items-center justify-center p-6">
          <div className="grid w-full max-w-[600px] grid-cols-2 gap-4">
            {members.slice(0, 4).map((member) => (
              <PeerCard key={member.id} member={member} onVolumeChange={setPeerVolume} />
            ))}
          </div>
        </div>

        <div className="flex h-16 w-full items-center justify-center gap-3 border-t border-border px-4">
          <button
            type="button"
            onClick={toggleMute}
            aria-label="Toggle mute"
            className={`${toolbarButton} text-white ${localMuted ? 'bg-muted hover:bg-muted/80' : 'bg-surface hover:bg-surface2'}`}
          >
            {localMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>

          <button
            type="button"
            onClick={toggleDeafen}
            aria-label="Toggle deafen"
            className={`${toolbarButton} text-white ${localDeafened ? 'bg-muted hover:bg-muted/80' : 'bg-surface hover:bg-surface2'}`}
          >
            {localDeafened ? <HeadphoneOff className="h-5 w-5" /> : <Headphones className="h-5 w-5" />}
          </button>

          <button
            type="button"
            onClick={() => setShowChat((prev) => !prev)}
            aria-label="Toggle chat"
            className={`${toolbarButton} ${showChat ? 'bg-accent text-white' : 'bg-surface text-text-primary hover:bg-surface2'}`}
          >
            <MessageSquare className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => setShowSettings(true)}
            aria-label="Open settings"
            className={`${toolbarButton} bg-surface text-text-primary hover:bg-surface2`}
          >
            <SettingsIcon className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={handleLeave}
            aria-label="Leave room"
            className={`${toolbarButton} bg-muted text-white hover:bg-muted/80`}
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
  )
}

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
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
} from 'lucide-react'
import { useVoice } from '../hooks/useVoice'
import { useVAD } from '../hooks/useVAD'
import { useVoiceStore } from '../store/voiceStore'
import { getVoiceEngine, lockRoom } from '../lib/rooms'
import MicMeter from '../components/MicMeter'
import Settings from './Settings'
import { PeerCard } from '../components/wisp/PeerCard'
import { ConnectionStatus } from '../components/wisp/ConnectionStatus'
import { ToolbarButton } from '../components/wisp/ToolbarButton'
import { ChatPanel } from '../components/wisp/ChatPanel'
import { Avatar } from '../components/wisp/Avatar'
import type { Peer as WispPeer, ChatMessage as WispChatMessage } from '../components/wisp/types'
import type { ConnectionQuality, Peer } from '../types'

function navigate(path: string): void {
  window.location.hash = path
}

function signalFromQuality(quality: ConnectionQuality): 1 | 2 | 3 {
  if (quality === 'good') return 3
  if (quality === 'ok') return 2
  return 1
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
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [volumes, setVolumes] = useState<Record<string, number>>({})

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
          {connectionState === 'error' && (
            <div className="flex items-center justify-center gap-3 bg-muted-red/20 px-4 py-2 text-sm text-muted-red">
              <AlertCircle className="h-4 w-4" />
              Connection lost.
              <button
                type="button"
                onClick={handleRetry}
                className="rounded bg-muted-red/30 px-2 py-1 text-xs font-medium text-text-primary hover:bg-muted-red/40"
              >
                Retry
              </button>
            </div>
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
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-sm font-semibold tracking-[0.2em]">{roomCode}</span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  aria-label="Copy room code"
                  className="grid h-7 w-7 place-items-center rounded-md text-text-tertiary hover:bg-surface2 hover:text-text-primary"
                >
                  {copied ? <Check size={12} className="text-speaking" /> : <Copy size={12} />}
                </button>
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowShare((prev) => !prev)}
                  className="ml-2 rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:border-accent hover:text-accent"
                >
                  Invite Friends
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

            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <ConnectionStatus peers={wispPeers} connected={connectionState === 'connected'} />
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
                onClick={() => setShowSettings(true)}
                aria-label="Open settings"
                className="grid h-8 w-8 place-items-center rounded-md text-text-tertiary hover:bg-surface2"
              >
                <SettingsIcon size={14} />
              </button>
              <span className="rounded-full bg-surface2 px-2.5 py-1 font-mono text-xs text-text-secondary">
                {wispPeers.length}/4
              </span>
            </div>
          </header>

          <div className="flex flex-1 overflow-hidden">
            <div className="grid flex-1 place-items-center overflow-y-auto p-8">
              <div className="grid w-full max-w-[560px] grid-cols-2 gap-4">
                {wispPeers.slice(0, 4).map((peer) => (
                  <PeerCard
                    key={peer.id}
                    peer={peer}
                    volume={volumes[peer.id] ?? 100}
                    onVolumeChange={(v) => handleVolumeChange(peer.id, v)}
                  />
                ))}
              </div>
            </div>
            <ChatPanel
              open={showChat}
              onClose={() => setShowChat(false)}
              messages={wispMessages}
              onSend={sendChat}
              self={{ id: selfName, name: selfName, isSelf: true }}
            />
          </div>

          <div className="px-4">
            <MicMeter analyser={analyser} isMuted={localMuted} />
          </div>

          <div
            className="relative flex h-16 items-center justify-center border-t border-border"
            style={{ background: '#0A0A0C' }}
          >
            <div className="absolute left-4 top-1/2 flex -translate-y-1/2 items-center gap-2">
              <Avatar id="self" name={selfName} size={32} />
              <div className="text-xs">
                <div className="font-medium">{selfName}</div>
                <div className="flex items-center gap-1.5 text-text-tertiary">
                  <span className={`h-1.5 w-1.5 rounded-full ${localMuted ? 'bg-muted-red' : 'bg-speaking'}`} />
                  <span>In room</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <ToolbarButton
                tooltip={localMuted ? 'Unmute' : 'Mute'}
                active={localMuted}
                danger={localMuted}
                onClick={toggleMute}
              >
                {localMuted ? <MicOff size={18} /> : <Mic size={18} />}
              </ToolbarButton>
              <ToolbarButton
                tooltip={localDeafened ? 'Undeafen' : 'Deafen'}
                active={localDeafened}
                danger={localDeafened}
                onClick={toggleDeafen}
              >
                {localDeafened ? <HeadphoneOff size={18} /> : <Headphones size={18} />}
              </ToolbarButton>
              <ToolbarButton tooltip="Chat" active={showChat} onClick={() => setShowChat((prev) => !prev)}>
                <MessageCircle size={18} />
              </ToolbarButton>
              <ToolbarButton tooltip="Settings" onClick={() => setShowSettings(true)}>
                <SettingsIcon size={18} />
              </ToolbarButton>
              <ToolbarButton tooltip="Leave" danger onClick={handleLeave}>
                <LogOut size={18} />
              </ToolbarButton>
            </div>
          </div>
        </div>

        {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      </div>
    </div>
  )
}

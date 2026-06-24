import { useCallback, useEffect, useState } from 'react'
import { Copy, Check, Loader2 } from 'lucide-react'
import { createRoom, getRecentRooms, joinRoom, saveRecentRoom } from '../lib/rooms'
import { useSettingsStore } from '../store/settingsStore'
import { useVoiceStore } from '../store/voiceStore'
import ResourceWidget from '../components/ResourceWidget'
import type { RecentRoom } from '../types'

const ROOM_CODE_PATTERN = /^[A-Za-z0-9]{6}$/

function navigate(path: string): void {
  window.location.hash = path
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export default function Home() {
  const displayName = useSettingsStore((state) => state.displayName)
  const setDisplayName = useSettingsStore((state) => state.setDisplayName)
  const setIsHost = useVoiceStore((state) => state.setIsHost)

  const [createdCode, setCreatedCode] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>([])

  useEffect(() => {
    setRecentRooms(getRecentRooms())
  }, [])

  const handleCreateRoom = useCallback(async () => {
    setCreating(true)
    setCreateError(null)
    try {
      const code = await createRoom()
      setCreatedCode(code)
      setJoinCode(code)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create room')
    } finally {
      setCreating(false)
    }
  }, [])

  const handleCopyCode = useCallback(() => {
    if (!createdCode) return
    void navigator.clipboard
      .writeText(createdCode)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }, [createdCode])

  const enterRoom = useCallback(
    async (code: string) => {
      const isHost = createdCode !== null && code === createdCode
      setIsHost(isHost)
      useVoiceStore.getState().setRoomCode(code)
      useVoiceStore.getState().setDisplayName(displayName)
      await joinRoom(code)
      saveRecentRoom({
        code,
        name: code,
        lastUsed: Date.now(),
        memberCount: 1,
      })
      setRecentRooms(getRecentRooms())
      navigate('/room')
    },
    [createdCode, setIsHost, displayName],
  )

  const handleJoin = useCallback(async () => {
    setJoinError(null)
    if (!ROOM_CODE_PATTERN.test(joinCode)) {
      setJoinError('Room code must be exactly 6 alphanumeric characters.')
      return
    }
    setJoining(true)
    try {
      await enterRoom(joinCode)
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Failed to join room')
    } finally {
      setJoining(false)
    }
  }, [joinCode, enterRoom])

  const handleRejoin = useCallback(
    async (code: string) => {
      setJoinError(null)
      setJoining(true)
      try {
        await enterRoom(code)
      } catch (error) {
        setJoinError(error instanceof Error ? error.message : 'Failed to join room')
      } finally {
        setJoining(false)
      }
    },
    [enterRoom],
  )

  return (
    <div className="relative flex h-screen w-screen flex-col items-center overflow-y-auto bg-background px-6 py-10 text-text-primary">
      <div className="flex w-full max-w-[480px] flex-1 flex-col items-center justify-center">
        <div className="mb-12 flex flex-col items-center gap-1">
          <h1 className="text-[48px] font-bold leading-none text-accent">Wisp</h1>
          <p className="text-base text-text-secondary">Voice that doesn&apos;t slow you down</p>
        </div>

        <div className="flex w-full flex-col gap-4">
          <div className="flex w-full flex-col gap-2">
            <label className="text-xs text-text-secondary" htmlFor="display-name">
              Display name
            </label>
            <input
              id="display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Your name"
              maxLength={32}
              className="rounded-card border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </div>

          <div className="w-full rounded-card border border-border bg-surface p-6">
            <h2 className="mb-3 text-sm font-semibold text-text-primary">Create Room</h2>
            <button
              type="button"
              onClick={handleCreateRoom}
              disabled={creating}
              className="flex w-full items-center justify-center gap-2 rounded-card bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {creating ? 'Creating...' : 'Create Room'}
            </button>

            {createError && <p className="mt-2 text-xs text-muted">{createError}</p>}

            {createdCode && (
              <div className="mt-3 flex items-center justify-between rounded-card bg-surface2 px-3 py-2">
                <span className="font-mono text-lg tracking-widest text-text-primary">{createdCode}</span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  aria-label="Copy room code"
                  className="rounded p-1 text-text-secondary transition-colors hover:text-text-primary"
                >
                  {copied ? <Check className="h-4 w-4 text-speaking" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            )}
          </div>

          <div className="w-full rounded-card border border-border bg-surface p-6">
            <h2 className="mb-3 text-sm font-semibold text-text-primary">Join Room</h2>
            <div className="flex gap-2">
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase().slice(0, 6))}
                placeholder="ABC123"
                maxLength={6}
                className="flex-1 rounded-card border border-border bg-surface2 px-3 py-2 font-mono text-sm uppercase tracking-widest text-text-primary outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={handleJoin}
                disabled={joining}
                className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                {joining ? 'Joining...' : 'Join'}
              </button>
            </div>
            {joinError && <p className="mt-2 text-xs text-muted">{joinError}</p>}
          </div>

          <div className="w-full rounded-card border border-border bg-surface p-6">
            <h2 className="mb-3 text-sm font-semibold text-text-primary">Recent Rooms</h2>
            {recentRooms.length === 0 ? (
              <p className="text-xs text-text-secondary">No recent rooms</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {recentRooms.map((room) => (
                  <li
                    key={room.code}
                    className="flex items-center justify-between rounded-card bg-surface2 px-3 py-2"
                  >
                    <div className="flex flex-col">
                      <span className="font-mono text-sm text-text-primary">{room.code}</span>
                      <span className="text-[11px] text-text-secondary">
                        {formatRelativeTime(room.lastUsed)} · {room.memberCount} member
                        {room.memberCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRejoin(room.code)}
                      disabled={joining}
                      className="rounded px-3 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-60"
                    >
                      Rejoin
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="fixed bottom-4 right-4">
        <ResourceWidget />
      </div>
    </div>
  )
}

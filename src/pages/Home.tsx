import { useCallback, useEffect, useState } from 'react'
import { Copy, Share2, Ghost, Loader2, Check, X } from 'lucide-react'
import { createRoom, getRecentRooms, joinRoom, removeRecentRoom, saveRecentRoom } from '../lib/rooms'
import { useSettingsStore } from '../store/settingsStore'
import { useVoiceStore } from '../store/voiceStore'
import ResourceWidget from '../components/ResourceWidget'
import { UpdateBanner } from '../components/UpdateBanner'
import { WispLogo } from '../components/wisp/WispLogo'
import { Avatar } from '../components/wisp/Avatar'
import { cn } from '../lib/utils'
import packageJson from '../../package.json'
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
  const [removingCodes, setRemovingCodes] = useState<Record<string, 'fading' | 'collapsing'>>({})

  useEffect(() => {
    setRecentRooms(getRecentRooms())
  }, [])

  const handleDeleteRoom = useCallback((code: string) => {
    setRemovingCodes((prev) => ({ ...prev, [code]: 'fading' }))
    setTimeout(() => {
      setRemovingCodes((prev) => ({ ...prev, [code]: 'collapsing' }))
      setTimeout(() => {
        removeRecentRoom(code)
        setRecentRooms(getRecentRooms())
        setRemovingCodes((prev) => {
          const next = { ...prev }
          delete next[code]
          return next
        })
      }, 150)
    }, 150)
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

  const handleShareCode = useCallback(() => {
    if (!createdCode) return
    void navigator.clipboard.writeText(createdCode).catch(() => {})
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
    <main className="flex min-h-screen justify-center overflow-y-auto bg-bg px-6 py-10">
      <div className="w-full max-w-[460px] space-y-6">
        <UpdateBanner />

        <header className="flex items-center justify-between">
          <WispLogo />
          <span className="rounded-full border border-border bg-surface2 px-2.5 py-1 text-[11px] text-text-tertiary">
            v{packageJson.version}
          </span>
        </header>

        <section className="flex items-center gap-3">
          <Avatar id={displayName || 'You'} name={displayName || 'You'} size={36} />
          <div className="flex-1">
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Display name"
              maxLength={32}
              className="w-full border-b border-border bg-transparent py-1 text-base font-medium outline-none transition-colors focus:border-accent"
            />
            <div className="mt-1 text-[11px] text-text-tertiary">Shown to others in your rooms</div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Create Room</h2>
            <span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-tertiary">
              Up to 4 people
            </span>
          </div>

          {!createdCode ? (
            <button
              type="button"
              onClick={handleCreateRoom}
              disabled={creating}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 font-semibold text-primary-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {creating ? 'Creating...' : 'Create a new room'}
            </button>
          ) : (
            <div className="space-y-3 animate-fade-scale-in">
              <div className="rounded-lg bg-surface2 p-4 text-center">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-text-tertiary">Room code</div>
                <div className="text-3xl font-mono font-bold tracking-[0.3em] text-accent">{createdCode}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs hover:border-border-hover"
                >
                  {copied ? <Check className="h-3 w-3 text-speaking" /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={handleShareCode}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs hover:border-border-hover"
                >
                  <Share2 size={12} /> Share
                </button>
              </div>
              <button
                type="button"
                onClick={() => void enterRoom(createdCode)}
                className="w-full rounded-lg bg-accent py-2.5 font-semibold text-primary-foreground hover:bg-accent-hover"
              >
                Enter Room
              </button>
              <div className="text-center text-[11px] text-text-tertiary">
                Share the code with your friends to invite them
              </div>
            </div>
          )}

          {createError && <p className="mt-2 text-xs text-muted-red">{createError}</p>}
        </section>

        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold">Join Room</h2>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase().slice(0, 6))}
              onKeyDown={(event) => event.key === 'Enter' && void handleJoin()}
              placeholder="ENTER CODE"
              maxLength={6}
              className={cn(
                'flex-1 rounded-lg border bg-surface2 px-3 py-2 text-center font-mono tracking-[0.3em] outline-none',
                joinError ? 'border-muted-red text-muted-red' : 'border-border focus:border-accent',
              )}
            />
            <button
              type="button"
              onClick={() => void handleJoin()}
              disabled={joining}
              className="rounded-lg bg-accent px-5 font-semibold text-primary-foreground hover:bg-accent-hover disabled:opacity-60"
            >
              {joining ? 'Joining...' : 'Join'}
            </button>
          </div>
          {joinError && <div className="mt-2 text-xs text-muted-red">{joinError}</div>}
        </section>

        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold">Recent Rooms</h2>
          {recentRooms.length === 0 ? (
            <div className="space-y-2 py-6 text-center">
              <Ghost size={28} className="mx-auto text-text-tertiary" />
              <div className="text-xs text-text-tertiary">No recent rooms yet</div>
            </div>
          ) : (
            <ul className="space-y-2">
              {recentRooms.map((room) => {
                const removing = removingCodes[room.code]
                return (
                  <li
                    key={room.code}
                    className="group flex items-center justify-between overflow-hidden rounded-lg hover:bg-surface2"
                    style={{
                      opacity: removing ? 0 : 1,
                      maxHeight: removing === 'collapsing' ? 0 : 56,
                      paddingTop: removing === 'collapsing' ? 0 : 10,
                      paddingBottom: removing === 'collapsing' ? 0 : 10,
                      transition:
                        removing === 'collapsing'
                          ? 'opacity 150ms ease, max-height 150ms ease, padding 150ms ease'
                          : 'opacity 150ms ease',
                    }}
                  >
                    <div className="px-2.5">
                      <div className="font-mono text-sm font-semibold tracking-wider">{room.code}</div>
                      <div className="text-[11px] text-text-tertiary">
                        {formatRelativeTime(room.lastUsed)} · {room.memberCount} member
                        {room.memberCount === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-2.5">
                      <button
                        type="button"
                        onClick={() => void handleRejoin(room.code)}
                        disabled={joining}
                        className="rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
                      >
                        Rejoin
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRoom(room.code)}
                        aria-label="Remove from recent rooms"
                        className="text-text-tertiary opacity-0 transition-opacity hover:text-muted-red group-hover:opacity-100"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="fixed bottom-4 right-4">
        <ResourceWidget />
      </div>
    </main>
  )
}

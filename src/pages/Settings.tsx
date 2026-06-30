import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { currentMonitor } from '@tauri-apps/api/window'
import {
  Check,
  ChevronDown,
  CornerDownLeft,
  CornerDownRight,
  CornerUpLeft,
  CornerUpRight,
  ExternalLink,
  Ghost,
  Info,
  Loader2,
  Lock,
  Play,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Dialog, DialogContent } from '../components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Slider } from '../components/ui/slider'
import { Switch } from '../components/ui/switch'
import { useSettingsStore } from '../store/settingsStore'
import { getInputDevices, getLabelOrDefault, getOutputDevices } from '../lib/devices'
import { checkForUpdate, installUpdate } from '../lib/updater'
import { getWispId } from '../lib/identity'
import {
  acceptRequest,
  addFriend,
  declineRequest,
  getFriends,
  getPendingOutgoing,
  getPendingRequests,
  removeFriend,
} from '../lib/friends'
import type { Friend, FriendRequest, PendingOutgoing } from '../lib/friends'
import ResourceWidget from '../components/ResourceWidget'
import { Avatar } from '../components/wisp/Avatar'
import { RebindPill } from '../components/wisp/RebindPill'
import { OverlayCompact, OverlayFull } from '../components/wisp/OverlayPreview'
import { cn } from '../lib/utils'
import packageJson from '../../package.json'
import type { HotkeyMap } from '../types'

type Tab = 'audio' | 'overlay' | 'hotkeys' | 'friends' | 'soundboard' | 'about'

const TABS: { id: Tab; label: string }[] = [
  { id: 'audio', label: 'Audio' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'hotkeys', label: 'Hotkeys' },
  { id: 'friends', label: 'Friends' },
  { id: 'soundboard', label: 'Soundboard' },
  { id: 'about', label: 'About' },
]

const HOTKEY_LABELS: Record<keyof HotkeyMap, string> = {
  mute: 'Mute',
  deafen: 'Deafen',
  overlayToggle: 'Toggle Overlay',
  overlayMode: 'Overlay Mode',
  soundboard1: 'Soundboard 1',
  soundboard2: 'Soundboard 2',
  soundboard3: 'Soundboard 3',
  soundboard4: 'Soundboard 4',
  soundboard5: 'Soundboard 5',
}

const OVERLAY_SIZE = { width: 220, height: 200 }
const SNAP_PADDING = 16

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

const CORNERS: { key: Corner; icon: ReactNode; label: string }[] = [
  { key: 'top-left', icon: <CornerUpLeft size={16} />, label: 'Top Left' },
  { key: 'top-right', icon: <CornerUpRight size={16} />, label: 'Top Right' },
  { key: 'bottom-left', icon: <CornerDownLeft size={16} />, label: 'Bottom Left' },
  { key: 'bottom-right', icon: <CornerDownRight size={16} />, label: 'Bottom Right' },
]

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mt-[6px] mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
        {title}
      </h3>
      <div>{children}</div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-[13px]">{label}</span>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  )
}

function LSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  suffix = '%',
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  suffix?: string
}) {
  return (
    <div className="flex w-[200px] items-center gap-3">
      <Slider
        value={[value]}
        min={min}
        max={max}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] ?? 0 : v)}
        className="flex-1"
      />
      <span className="w-12 shrink-0 text-right font-mono text-xs text-text-secondary">
        {value}
        {suffix}
      </span>
    </div>
  )
}

function SliderRow({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  suffix = '%',
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  suffix?: string
}) {
  return (
    <div className="py-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[13px]">{label}</span>
        <span className="font-mono text-xs text-text-secondary">
          {value}
          {suffix}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] ?? 0 : v)}
        className="w-full"
      />
    </div>
  )
}

function AudioTab() {
  const inputDevice = useSettingsStore((state) => state.inputDevice)
  const outputDevice = useSettingsStore((state) => state.outputDevice)
  const micVolume = useSettingsStore((state) => state.micVolume)
  const outputVolume = useSettingsStore((state) => state.outputVolume)
  const noiseSuppression = useSettingsStore((state) => state.noiseSuppression)
  const echoCancellation = useSettingsStore((state) => state.echoCancellation)
  const soundEffects = useSettingsStore((state) => state.soundEffects)
  const audioDucking = useSettingsStore((state) => state.audioDucking)
  const duckAmount = useSettingsStore((state) => state.duckAmount)
  const vadThreshold = useSettingsStore((state) => state.vadThreshold)
  const pushToTalkEnabled = useSettingsStore((state) => state.pushToTalkEnabled)
  const pushToTalkKey = useSettingsStore((state) => state.pushToTalkKey)
  const noiseGateEnabled = useSettingsStore((state) => state.noiseGateEnabled)
  const noiseGateThreshold = useSettingsStore((state) => state.noiseGateThreshold)

  const setInputDevice = useSettingsStore((state) => state.setInputDevice)
  const setOutputDevice = useSettingsStore((state) => state.setOutputDevice)
  const setMicVolume = useSettingsStore((state) => state.setMicVolume)
  const setOutputVolume = useSettingsStore((state) => state.setOutputVolume)
  const setNoiseSuppression = useSettingsStore((state) => state.setNoiseSuppression)
  const setEchoCancellation = useSettingsStore((state) => state.setEchoCancellation)
  const setSoundEffects = useSettingsStore((state) => state.setSoundEffects)
  const setAudioDucking = useSettingsStore((state) => state.setAudioDucking)
  const setDuckAmount = useSettingsStore((state) => state.setDuckAmount)
  const setVadThreshold = useSettingsStore((state) => state.setVadThreshold)
  const setPushToTalkEnabled = useSettingsStore((state) => state.setPushToTalkEnabled)
  const setPushToTalkKey = useSettingsStore((state) => state.setPushToTalkKey)
  const setNoiseGateEnabled = useSettingsStore((state) => state.setNoiseGateEnabled)
  const setNoiseGateThreshold = useSettingsStore((state) => state.setNoiseGateThreshold)

  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([])
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([])
  const [advOpen, setAdvOpen] = useState(false)

  useEffect(() => {
    void getInputDevices().then(setInputDevices)
    void getOutputDevices().then(setOutputDevices)
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <Section title="Input / Output">
        <div className="py-2">
          <span className="mb-1.5 block text-[13px]">Input device</span>
          <select
            value={inputDevice}
            onChange={(event) => setInputDevice(event.target.value)}
            className="h-[34px] w-full truncate rounded-md border border-border bg-surface2 px-2.5 text-xs outline-none focus:border-accent"
          >
            <option value="">System default</option>
            {inputDevices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {getLabelOrDefault(device, index)}
              </option>
            ))}
          </select>
        </div>
        <div className="py-2">
          <span className="mb-1.5 block text-[13px]">Output device</span>
          <select
            value={outputDevice}
            onChange={(event) => setOutputDevice(event.target.value)}
            className="h-[34px] w-full truncate rounded-md border border-border bg-surface2 px-2.5 text-xs outline-none focus:border-accent"
          >
            <option value="">System default</option>
            {outputDevices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {getLabelOrDefault(device, index)}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <Section title="Push-to-talk">
        <Row label="Enable push-to-talk">
          <Switch checked={pushToTalkEnabled} onCheckedChange={setPushToTalkEnabled} />
        </Row>
        {pushToTalkEnabled && (
          <div className="animate-fade-scale-in border-l-2 border-accent/40 pl-4">
            <Row label="Push-to-talk key">
              <RebindPill value={pushToTalkKey} onChange={setPushToTalkKey} />
            </Row>
          </div>
        )}
      </Section>

      <Section title="Quick settings">
        <Row label="Noise suppression">
          <Switch checked={noiseSuppression} onCheckedChange={setNoiseSuppression} />
        </Row>
        <Row label="Echo cancellation">
          <Switch checked={echoCancellation} onCheckedChange={setEchoCancellation} />
        </Row>
        <Row label="Audio ducking">
          <Switch checked={audioDucking} onCheckedChange={setAudioDucking} />
        </Row>
        <Row label="Sound effects">
          <Switch checked={soundEffects} onCheckedChange={setSoundEffects} />
        </Row>
        {audioDucking && (
          <div className="animate-fade-scale-in border-l-2 border-accent/40 pl-4">
            <SliderRow label="Duck amount" value={Math.round(duckAmount * 100)} onChange={(v) => setDuckAmount(v / 100)} />
          </div>
        )}
      </Section>

      <Section title="Volumes">
        <SliderRow
          label="Mic volume"
          value={Math.round(micVolume * 100)}
          max={200}
          onChange={(v) => setMicVolume(v / 100)}
        />
        <SliderRow
          label="Output volume"
          value={Math.round(outputVolume * 100)}
          max={200}
          onChange={(v) => setOutputVolume(v / 100)}
        />
      </Section>

      <div>
        <button
          type="button"
          onClick={() => setAdvOpen((v) => !v)}
          className="flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary"
        >
          <ChevronDown size={14} className={cn('transition-transform', advOpen && 'rotate-180')} />
          Advanced
        </button>
        {advOpen && (
          <div className="animate-fade-scale-in mt-2 flex flex-col gap-1">
            <SliderRow label="VAD sensitivity" value={vadThreshold} min={-80} max={-20} suffix=" dB" onChange={setVadThreshold} />
            <Row label="Noise gate">
              <Switch checked={noiseGateEnabled} onCheckedChange={setNoiseGateEnabled} />
            </Row>
            {noiseGateEnabled && (
              <div className="animate-fade-scale-in border-l-2 border-accent/40 pl-4">
                <SliderRow
                  label="Noise gate threshold"
                  value={noiseGateThreshold}
                  min={-80}
                  max={-20}
                  suffix=" dB"
                  onChange={setNoiseGateThreshold}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function OverlayTab() {
  const displayName = useSettingsStore((state) => state.displayName)
  const overlayMode = useSettingsStore((state) => state.overlayMode)
  const overlayAutoHide = useSettingsStore((state) => state.overlayAutoHide)
  const overlayOpacity = useSettingsStore((state) => state.overlayOpacity)
  const setOverlayMode = useSettingsStore((state) => state.setOverlayMode)
  const setOverlayAutoHide = useSettingsStore((state) => state.setOverlayAutoHide)
  const setOverlayOpacity = useSettingsStore((state) => state.setOverlayOpacity)

  const [overlayVisible, setOverlayVisible] = useState(false)
  const [corner, setCorner] = useState<Corner>('top-right')

  const handleToggleVisible = useCallback((next: boolean) => {
    setOverlayVisible(next)
    void invoke(next ? 'show_overlay' : 'hide_overlay').catch(() => {})
  }, [])

  const handleCorner = useCallback(async (next: Corner) => {
    setCorner(next)
    try {
      const monitor = await currentMonitor()
      if (!monitor) return
      const { x: screenX, y: screenY } = monitor.position
      const { width: screenWidth, height: screenHeight } = monitor.size
      const x = next.includes('left')
        ? screenX + SNAP_PADDING
        : screenX + screenWidth - OVERLAY_SIZE.width - SNAP_PADDING
      const y = next.includes('top')
        ? screenY + SNAP_PADDING
        : screenY + screenHeight - OVERLAY_SIZE.height - SNAP_PADDING
      await invoke('set_overlay_position', { x: Math.round(x), y: Math.round(y) })
    } catch {
      // Tauri window API unavailable outside a Tauri window
    }
  }, [])

  const previewPeers = [{ id: 'self', name: displayName || 'You', speaking: true, muted: false }]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-lg bg-surface2 p-3">
        <div>
          <div className="text-sm font-medium">Show game overlay</div>
          <div className="text-xs text-text-tertiary">Floating panel during games</div>
        </div>
        <Switch checked={overlayVisible} onCheckedChange={handleToggleVisible} />
      </div>
      <div className="flex items-start gap-1.5 px-1 text-[11px] text-text-tertiary">
        <Info size={12} className="mt-0.5 shrink-0" />
        <span>
          Works best with Borderless Windowed or Windowed mode. Some games in Exclusive Fullscreen mode may not
          show the overlay due to Windows limitations.
        </span>
      </div>

      <Section title="Mode">
        <div className="inline-flex rounded-lg bg-surface2 p-1">
          {(['compact', 'full'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setOverlayMode(mode)}
              className={cn(
                'rounded-md px-4 py-1.5 text-xs font-medium capitalize transition-colors',
                overlayMode === mode ? 'bg-accent text-primary-foreground' : 'text-text-secondary',
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Behavior">
        <Row label="Auto-hide">
          <Switch checked={overlayAutoHide} onCheckedChange={setOverlayAutoHide} />
        </Row>
        <Row label="Opacity">
          <LSlider
            value={Math.round(overlayOpacity * 100)}
            min={30}
            max={100}
            onChange={(v) => setOverlayOpacity(v / 100)}
          />
        </Row>
      </Section>

      <Section title="Position">
        <div className="grid grid-cols-2 gap-2">
          {CORNERS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => void handleCorner(c.key)}
              className={cn(
                'flex items-center gap-2 rounded-lg border bg-surface2 p-3 text-sm transition-colors',
                corner === c.key ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:border-border-hover',
              )}
            >
              {c.icon}
              {c.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Preview">
        <div
          className="relative h-32 overflow-hidden rounded-lg border border-border"
          style={{ background: 'linear-gradient(135deg, #1a1a2a, #2a1a2a)' }}
        >
          <div
            className="absolute"
            style={{
              opacity: overlayOpacity,
              top: corner.includes('top') ? 8 : undefined,
              bottom: corner.includes('bottom') ? 8 : undefined,
              left: corner.includes('left') ? 8 : undefined,
              right: corner.includes('right') ? 8 : undefined,
            }}
          >
            {overlayMode === 'compact' ? (
              <OverlayCompact peers={previewPeers} />
            ) : (
              <OverlayFull peers={previewPeers} />
            )}
          </div>
        </div>
      </Section>
    </div>
  )
}

function HotkeysTab() {
  const hotkeys = useSettingsStore((state) => state.hotkeys)
  const setHotkeys = useSettingsStore((state) => state.setHotkeys)

  return (
    <div className="flex flex-col">
      <p className="mb-1 text-xs text-text-tertiary">Click a key to rebind. Modifier combos supported.</p>
      {(Object.keys(HOTKEY_LABELS) as (keyof HotkeyMap)[]).map((action) => (
        <Row key={action} label={HOTKEY_LABELS[action]}>
          <RebindPill
            value={hotkeys[action]}
            onChange={(combo) => setHotkeys({ ...hotkeys, [action]: combo })}
          />
        </Row>
      ))}
    </div>
  )
}

function FriendsTab() {
  const [wispId] = useState(() => getWispId())
  const [friends, setFriends] = useState<Friend[]>(() => getFriends())
  const [pendingOutgoing, setPendingOutgoing] = useState<PendingOutgoing[]>(() => getPendingOutgoing())
  const [pendingIncoming, setPendingIncoming] = useState<FriendRequest[]>(() => getPendingRequests())
  const [copied, setCopied] = useState(false)
  const [newFriendId, setNewFriendId] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [hoveredFriend, setHoveredFriend] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setFriends(getFriends())
    setPendingOutgoing(getPendingOutgoing())
    setPendingIncoming(getPendingRequests())
  }, [])

  const handleCopyId = useCallback(() => {
    void navigator.clipboard
      .writeText(wispId)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }, [wispId])

  const handleAddFriend = useCallback(() => {
    setAddError(null)
    const candidateId = newFriendId.trim().toUpperCase()
    setSending(true)
    addFriend(candidateId)
      .then(() => {
        setNewFriendId('')
        refresh()
      })
      .catch((error: unknown) => {
        setAddError(error instanceof Error ? error.message : 'Failed to send request')
      })
      .finally(() => setSending(false))
  }, [newFriendId, refresh])

  const handleRemoveFriend = useCallback(
    (id: string) => {
      removeFriend(id)
      refresh()
    },
    [refresh],
  )

  const handleAccept = useCallback(
    (fromWispId: string) => {
      acceptRequest(fromWispId)
      refresh()
    },
    [refresh],
  )

  const handleDecline = useCallback(
    (fromWispId: string) => {
      declineRequest(fromWispId)
      refresh()
    },
    [refresh],
  )

  return (
    <div className="flex flex-col gap-3">
      <Section title="Your Wisp ID">
        <div className="flex items-center gap-3 rounded-lg bg-surface2 p-3">
          <div className="flex-1 font-mono text-2xl tracking-[0.2em] text-accent">{wispId}</div>
          <button
            type="button"
            onClick={handleCopyId}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:border-border-hover"
          >
            {copied ? <Check size={12} className="text-speaking" /> : null}
            {copied ? 'Copied' : 'Copy ID'}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-text-tertiary">Share this with friends so they can add you</p>
      </Section>

      <Section title="Add a friend">
        <div className="flex gap-2">
          <input
            value={newFriendId}
            onChange={(event) => setNewFriendId(event.target.value.toUpperCase().slice(0, 8))}
            placeholder="Enter their Wisp ID (8 characters)"
            maxLength={8}
            className="h-[34px] flex-1 rounded-md border border-border bg-surface2 px-2.5 font-mono text-xs outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={handleAddFriend}
            disabled={sending || newFriendId.length !== 8}
            className="h-[34px] shrink-0 rounded-md bg-accent px-3 text-xs font-semibold text-primary-foreground hover:bg-accent-hover disabled:opacity-50"
          >
            {sending ? 'Sending...' : 'Send request'}
          </button>
        </div>
        {addError && <p className="mt-1.5 text-xs text-muted-red">{addError}</p>}
      </Section>

      {pendingIncoming.length > 0 && (
        <Section title="Requests">
          <ul className="flex flex-col gap-1.5">
            {pendingIncoming.map((request) => (
              <li key={request.from} className="flex items-center gap-3 rounded-lg bg-surface2 p-2">
                <Avatar id={request.from} name={request.fromName || request.from} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{request.fromName || request.from}</div>
                  <div className="font-mono text-[11px] text-text-tertiary">{request.from}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDecline(request.from)}
                  className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface"
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={() => handleAccept(request.from)}
                  className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-accent-hover"
                >
                  Accept
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Friends">
        {friends.length === 0 && pendingOutgoing.length === 0 ? (
          <p className="py-4 text-center text-xs text-text-tertiary">
            No friends added yet. Share your Wisp ID to get started.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {pendingOutgoing.map((pending) => (
              <li key={pending.wispId} className="flex items-center gap-3 rounded-lg bg-surface2 p-2 opacity-60">
                <Avatar id={pending.wispId} name={pending.wispId} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] text-text-tertiary">{pending.wispId}</div>
                </div>
                <span className="rounded-full bg-text-tertiary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
                  Sent
                </span>
              </li>
            ))}
            {friends.map((friend) => (
              <li
                key={friend.wispId}
                onMouseEnter={() => setHoveredFriend(friend.wispId)}
                onMouseLeave={() => setHoveredFriend((prev) => (prev === friend.wispId ? null : prev))}
                className="flex items-center gap-3 rounded-lg bg-surface2 p-2"
              >
                <Avatar id={friend.wispId} name={friend.name} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{friend.name}</div>
                  <div className="font-mono text-[11px] text-text-tertiary">{friend.wispId}</div>
                </div>
                <span
                  className={cn('h-2 w-2 rounded-full', friend.online ? 'bg-speaking' : 'bg-text-tertiary/40')}
                  aria-label={friend.online ? 'Online' : 'Offline'}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveFriend(friend.wispId)}
                  aria-label={`Remove ${friend.name}`}
                  className={cn(
                    'grid h-6 w-6 place-items-center rounded-md text-muted-red transition-opacity hover:bg-muted-red/15',
                    hoveredFriend === friend.wispId ? 'opacity-100' : 'opacity-0',
                  )}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function SoundboardTab() {
  const soundboardFiles = useSettingsStore((state) => state.soundboardFiles)
  const setSoundboardFile = useSettingsStore((state) => state.setSoundboardFile)
  const [fileNames, setFileNames] = useState<Record<number, string>>({})

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pendingSlotRef = useRef<number | null>(null)

  const handleUploadClick = useCallback((slot: number) => {
    pendingSlotRef.current = slot
    fileInputRef.current?.click()
  }, [])

  const handleFileChosen = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      const slot = pendingSlotRef.current
      event.target.value = ''
      if (!file || slot === null) return

      try {
        const data = await readFileAsBase64(file)
        const path = await invoke<string>('save_soundboard_file', {
          index: slot,
          data,
          filename: file.name,
        })
        setSoundboardFile(slot, path)
        setFileNames((prev) => ({ ...prev, [slot]: file.name }))
      } catch (error) {
        console.warn('Failed to save soundboard file', error)
      }
    },
    [setSoundboardFile],
  )

  const handlePreview = useCallback(
    async (slot: number) => {
      const path = soundboardFiles[slot]
      if (!path) return
      try {
        await invoke('play_soundboard_file', { path })
      } catch {
        try {
          await new Audio(path).play()
        } catch {
          // playback unavailable for this file
        }
      }
    },
    [soundboardFiles],
  )

  const handleClear = useCallback(
    async (slot: number) => {
      const path = soundboardFiles[slot]
      if (path) {
        try {
          await invoke('delete_soundboard_file', { path })
        } catch {
          // best-effort cleanup; clear the slot regardless
        }
      }
      setSoundboardFile(slot, '')
      setFileNames((prev) => {
        const next = { ...prev }
        delete next[slot]
        return next
      })
    },
    [soundboardFiles, setSoundboardFile],
  )

  return (
    <div className="flex flex-col gap-1.5">
      <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileChosen} />
      {soundboardFiles.map((file, slot) => (
        <div key={slot} className="flex items-center gap-3 rounded-lg bg-surface2 p-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-accent/15 text-xs font-bold text-accent">
            {slot + 1}
          </span>
          <div className="flex-1 truncate text-sm">
            {file ? fileNames[slot] ?? 'Custom sound' : <span className="text-text-tertiary">Empty</span>}
          </div>
          <button
            type="button"
            onClick={() => handleUploadClick(slot)}
            aria-label="Upload sound"
            className="grid h-8 w-8 place-items-center rounded-md border border-border hover:border-border-hover"
          >
            <Upload size={14} />
          </button>
          <button
            type="button"
            onClick={() => void handlePreview(slot)}
            disabled={!file}
            aria-label="Preview sound"
            className="grid h-8 w-8 place-items-center rounded-md bg-speaking/15 text-speaking hover:bg-speaking/25 disabled:opacity-40"
          >
            <Play size={14} />
          </button>
          <button
            type="button"
            onClick={() => void handleClear(slot)}
            disabled={!file}
            aria-label="Clear sound"
            className="grid h-8 w-8 place-items-center rounded-md bg-muted-red/15 text-muted-red hover:bg-muted-red/25 disabled:opacity-40"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

type UpdateCheckStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'installing'

function AboutTab() {
  const [updateStatus, setUpdateStatus] = useState<UpdateCheckStatus>('idle')
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)

  const handleCheckForUpdates = useCallback(async () => {
    setUpdateStatus('checking')
    const info = await checkForUpdate()
    if (info.available && info.version) {
      setUpdateVersion(info.version)
      setUpdateStatus('available')
    } else {
      setUpdateStatus('up-to-date')
      setTimeout(() => {
        setUpdateStatus((current) => (current === 'up-to-date' ? 'idle' : current))
      }, 3000)
    }
  }, [])

  const handleInstallUpdate = useCallback(() => {
    setUpdateStatus('installing')
    void installUpdate().catch(() => setUpdateStatus('available'))
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-1">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/15 text-accent">
          <Ghost size={26} />
        </div>
        <div className="text-base font-semibold">Wisp</div>
        <div className="text-xs text-text-tertiary">v{packageJson.version}</div>
      </div>
      <p className="text-center text-[13px] text-text-secondary">
        A featherweight voice chat for gamers. No accounts, no servers — just a code and your squad.
      </p>

      <div className="flex flex-col items-center gap-1.5 rounded-lg bg-surface2 p-2.5">
        {updateStatus === 'available' ? (
          <button
            type="button"
            onClick={handleInstallUpdate}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-accent-hover"
          >
            Update to {updateVersion}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleCheckForUpdates()}
            disabled={updateStatus === 'checking' || updateStatus === 'installing'}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:border-border-hover disabled:opacity-60"
          >
            {(updateStatus === 'checking' || updateStatus === 'installing') && (
              <Loader2 size={12} className="animate-spin" />
            )}
            {updateStatus === 'checking' && 'Checking...'}
            {updateStatus === 'installing' && 'Installing...'}
            {(updateStatus === 'idle' || updateStatus === 'up-to-date') && 'Check for updates'}
          </button>
        )}
        {updateStatus === 'up-to-date' && (
          <span className="flex items-center gap-1 text-[11px] text-speaking">
            <Check size={12} /> You are on the latest version
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { v: '< 50 MB', l: 'memory' },
          { v: '< 1%', l: 'CPU' },
          { v: 'E2E', l: 'encrypted' },
        ].map((s) => (
          <div key={s.l} className="rounded-lg bg-surface2 p-2 text-center">
            <div className="text-sm font-semibold text-accent">{s.v}</div>
            <div className="text-[10px] uppercase tracking-wider text-text-tertiary">{s.l}</div>
          </div>
        ))}
      </div>
      <a
        href="https://github.com/chidhvilasa/wisp-voice"
        target="_blank"
        rel="noreferrer"
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-border py-1.5 text-sm hover:border-border-hover"
      >
        <ExternalLink size={14} /> View on GitHub
      </a>
      <div className="flex items-center gap-2 rounded-lg border border-speaking/30 bg-speaking/10 p-2 text-xs">
        <Lock size={14} className="text-speaking" />
        <span className="text-speaking">DTLS-SRTP Encrypted</span>
      </div>
      <div className="flex justify-center">
        <ResourceWidget />
      </div>
    </div>
  )
}

interface SettingsProps {
  onClose: () => void
}

export default function Settings({ onClose }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('audio')
  const displayName = useSettingsStore((state) => state.displayName)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          'flex w-[800px] max-w-[800px] h-[620px] max-h-[90vh] flex-col rounded-2xl border border-border bg-surface p-0',
          'animate-fade-scale-in shadow-2xl',
        )}
      >
        <header className="shrink-0 border-b border-border px-5 py-4">
          <h2 className="mb-2 text-base font-semibold">Settings</h2>
          <div className="flex items-center gap-3">
            <Avatar id={displayName || 'You'} name={displayName || 'You'} size={32} />
            <div className="text-sm font-medium">{displayName || 'You'}</div>
          </div>
        </header>

        <Tabs
          orientation="vertical"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as Tab)}
          className="min-h-0 flex-1 flex-row gap-0"
        >
          <TabsList className="h-full w-[160px] shrink-0 flex-col items-stretch gap-0.5 overflow-y-auto rounded-none border-r border-border bg-transparent p-3">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={cn(
                  'h-auto w-full flex-none grow-0 justify-start rounded-lg border-0 px-3 py-2 text-left text-[13px] whitespace-nowrap',
                  'data-active:bg-surface2 data-active:text-text-primary data-active:shadow-none',
                )}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
            <TabsContent value="audio" className="mt-0">
              <AudioTab />
            </TabsContent>
            <TabsContent value="overlay" className="mt-0">
              <OverlayTab />
            </TabsContent>
            <TabsContent value="hotkeys" className="mt-0">
              <HotkeysTab />
            </TabsContent>
            <TabsContent value="friends" className="mt-0">
              <FriendsTab />
            </TabsContent>
            <TabsContent value="soundboard" className="mt-0">
              <SoundboardTab />
            </TabsContent>
            <TabsContent value="about" className="mt-0">
              <AboutTab />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

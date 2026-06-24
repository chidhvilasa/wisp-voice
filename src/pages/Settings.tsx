import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { currentMonitor } from '@tauri-apps/api/window'
import { Pencil, Play, Trash2, Upload, X } from 'lucide-react'
import { useSettingsStore } from '../store/settingsStore'
import { getInputDevices, getLabelOrDefault, getOutputDevices } from '../lib/devices'
import ResourceWidget from '../components/ResourceWidget'
import Toggle from '../components/Toggle'
import packageJson from '../../package.json'
import type { HotkeyMap } from '../types'

type Tab = 'audio' | 'overlay' | 'hotkeys' | 'soundboard' | 'about'

const TABS: { id: Tab; label: string }[] = [
  { id: 'audio', label: 'Audio' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'hotkeys', label: 'Hotkeys' },
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

function comboFromEvent(event: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return null
  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.shiftKey) parts.push('Shift')
  if (event.altKey) parts.push('Alt')
  if (event.metaKey) parts.push('Meta')
  parts.push(event.key.length === 1 ? event.key.toUpperCase() : event.key)
  return parts.join('+')
}

function AudioTab() {
  const inputDevice = useSettingsStore((state) => state.inputDevice)
  const outputDevice = useSettingsStore((state) => state.outputDevice)
  const micVolume = useSettingsStore((state) => state.micVolume)
  const outputVolume = useSettingsStore((state) => state.outputVolume)
  const noiseSuppression = useSettingsStore((state) => state.noiseSuppression)
  const echoCancellation = useSettingsStore((state) => state.echoCancellation)
  const audioDucking = useSettingsStore((state) => state.audioDucking)
  const duckAmount = useSettingsStore((state) => state.duckAmount)
  const vadThreshold = useSettingsStore((state) => state.vadThreshold)

  const setInputDevice = useSettingsStore((state) => state.setInputDevice)
  const setOutputDevice = useSettingsStore((state) => state.setOutputDevice)
  const setMicVolume = useSettingsStore((state) => state.setMicVolume)
  const setOutputVolume = useSettingsStore((state) => state.setOutputVolume)
  const setNoiseSuppression = useSettingsStore((state) => state.setNoiseSuppression)
  const setEchoCancellation = useSettingsStore((state) => state.setEchoCancellation)
  const setAudioDucking = useSettingsStore((state) => state.setAudioDucking)
  const setDuckAmount = useSettingsStore((state) => state.setDuckAmount)
  const setVadThreshold = useSettingsStore((state) => state.setVadThreshold)

  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([])
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([])

  useEffect(() => {
    void getInputDevices().then(setInputDevices)
    void getOutputDevices().then(setOutputDevices)
  }, [])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-text-secondary">Input device</label>
        <select
          value={inputDevice}
          onChange={(event) => setInputDevice(event.target.value)}
          className="rounded-card border border-border bg-surface2 px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
        >
          <option value="">System default</option>
          {inputDevices.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {getLabelOrDefault(device, index)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-text-secondary">Output device</label>
        <select
          value={outputDevice}
          onChange={(event) => setOutputDevice(event.target.value)}
          className="rounded-card border border-border bg-surface2 px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
        >
          <option value="">System default</option>
          {outputDevices.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {getLabelOrDefault(device, index)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-text-secondary">Mic volume — {Math.round(micVolume * 100)}%</label>
        <input
          type="range"
          min={0}
          max={200}
          value={Math.round(micVolume * 100)}
          onChange={(event) => setMicVolume(Number(event.target.value) / 100)}
          className="accent-accent"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-text-secondary">
          Output volume — {Math.round(outputVolume * 100)}%
        </label>
        <input
          type="range"
          min={0}
          max={200}
          value={Math.round(outputVolume * 100)}
          onChange={(event) => setOutputVolume(Number(event.target.value) / 100)}
          className="accent-accent"
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-text-primary">Noise suppression</span>
        <Toggle checked={noiseSuppression} onChange={setNoiseSuppression} label="Noise suppression" />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-text-primary">Echo cancellation</span>
        <Toggle checked={echoCancellation} onChange={setEchoCancellation} label="Echo cancellation" />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-text-primary">Audio ducking</span>
        <Toggle checked={audioDucking} onChange={setAudioDucking} label="Audio ducking" />
      </div>

      {audioDucking && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-text-secondary">
            Duck amount — {Math.round(duckAmount * 100)}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(duckAmount * 100)}
            onChange={(event) => setDuckAmount(Number(event.target.value) / 100)}
            className="accent-accent"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-text-secondary">VAD sensitivity — {vadThreshold}dB</label>
        <input
          type="range"
          min={-80}
          max={-20}
          value={vadThreshold}
          onChange={(event) => setVadThreshold(Number(event.target.value))}
          className="accent-accent"
        />
      </div>
    </div>
  )
}

function OverlayTab() {
  const overlayMode = useSettingsStore((state) => state.overlayMode)
  const overlayAutoHide = useSettingsStore((state) => state.overlayAutoHide)
  const overlayOpacity = useSettingsStore((state) => state.overlayOpacity)
  const setOverlayMode = useSettingsStore((state) => state.setOverlayMode)
  const setOverlayAutoHide = useSettingsStore((state) => state.setOverlayAutoHide)
  const setOverlayOpacity = useSettingsStore((state) => state.setOverlayOpacity)

  const [overlayVisible, setOverlayVisible] = useState(false)

  const handleToggleVisible = useCallback(() => {
    const next = !overlayVisible
    setOverlayVisible(next)
    void invoke(next ? 'show_overlay' : 'hide_overlay').catch(() => {})
  }, [overlayVisible])

  const handleCorner = useCallback(async (corner: Corner) => {
    try {
      const monitor = await currentMonitor()
      if (!monitor) return
      const { x: screenX, y: screenY } = monitor.position
      const { width: screenWidth, height: screenHeight } = monitor.size
      const x = corner.includes('left')
        ? screenX + SNAP_PADDING
        : screenX + screenWidth - OVERLAY_SIZE.width - SNAP_PADDING
      const y = corner.includes('top')
        ? screenY + SNAP_PADDING
        : screenY + screenHeight - OVERLAY_SIZE.height - SNAP_PADDING
      await invoke('set_overlay_position', { x: Math.round(x), y: Math.round(y) })
    } catch {
      // Tauri window API unavailable outside a Tauri window
    }
  }, [])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-primary">Show overlay</span>
        <Toggle checked={overlayVisible} onChange={handleToggleVisible} label="Show overlay" />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-text-secondary">Mode</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOverlayMode('compact')}
            className={`flex-1 rounded-card px-3 py-1.5 text-sm font-medium ${
              overlayMode === 'compact' ? 'bg-accent text-white' : 'bg-surface2 text-text-secondary'
            }`}
          >
            Compact
          </button>
          <button
            type="button"
            onClick={() => setOverlayMode('full')}
            className={`flex-1 rounded-card px-3 py-1.5 text-sm font-medium ${
              overlayMode === 'full' ? 'bg-accent text-white' : 'bg-surface2 text-text-secondary'
            }`}
          >
            Full
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-text-primary">Auto-hide</span>
        <Toggle checked={overlayAutoHide} onChange={setOverlayAutoHide} label="Auto-hide" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-text-secondary">
          Opacity — {Math.round(overlayOpacity * 100)}%
        </label>
        <input
          type="range"
          min={30}
          max={100}
          value={Math.round(overlayOpacity * 100)}
          onChange={(event) => setOverlayOpacity(Number(event.target.value) / 100)}
          className="accent-accent"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-text-secondary">Screen corner</span>
        <div className="grid w-32 grid-cols-2 grid-rows-2 gap-2">
          <button
            type="button"
            onClick={() => void handleCorner('top-left')}
            className="h-10 rounded-card border border-border bg-surface2 hover:border-accent"
            aria-label="Snap to top-left"
          />
          <button
            type="button"
            onClick={() => void handleCorner('top-right')}
            className="h-10 rounded-card border border-border bg-surface2 hover:border-accent"
            aria-label="Snap to top-right"
          />
          <button
            type="button"
            onClick={() => void handleCorner('bottom-left')}
            className="h-10 rounded-card border border-border bg-surface2 hover:border-accent"
            aria-label="Snap to bottom-left"
          />
          <button
            type="button"
            onClick={() => void handleCorner('bottom-right')}
            className="h-10 rounded-card border border-border bg-surface2 hover:border-accent"
            aria-label="Snap to bottom-right"
          />
        </div>
      </div>
    </div>
  )
}

function HotkeysTab() {
  const hotkeys = useSettingsStore((state) => state.hotkeys)
  const setHotkeys = useSettingsStore((state) => state.setHotkeys)
  const [capturing, setCapturing] = useState<keyof HotkeyMap | null>(null)

  useEffect(() => {
    if (!capturing) return

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      const combo = comboFromEvent(event)
      if (!combo) return
      setHotkeys({ ...hotkeys, [capturing]: combo })
      setCapturing(null)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [capturing, hotkeys, setHotkeys])

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs text-text-secondary">
          <th className="py-2">Action</th>
          <th className="py-2">Current Binding</th>
          <th className="py-2">Edit</th>
        </tr>
      </thead>
      <tbody>
        {(Object.keys(HOTKEY_LABELS) as (keyof HotkeyMap)[]).map((action) => (
          <tr key={action} className="border-b border-border/50">
            <td className="py-2 text-text-primary">{HOTKEY_LABELS[action]}</td>
            <td className="py-2 font-mono text-text-secondary">
              {capturing === action ? 'Press any key...' : hotkeys[action]}
            </td>
            <td className="py-2">
              <button
                type="button"
                onClick={() => setCapturing(action)}
                className="rounded p-1 text-text-secondary hover:text-text-primary"
                aria-label={`Edit ${HOTKEY_LABELS[action]} hotkey`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
    <div className="flex flex-col gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFileChosen}
      />
      {soundboardFiles.map((file, slot) => (
        <div
          key={slot}
          className="flex items-center justify-between rounded-card border border-border bg-surface2 px-3 py-2"
        >
          <div className="flex flex-col">
            <span className="text-xs text-text-secondary">Slot {slot + 1}</span>
            <span className="text-sm text-text-primary">{file ? fileNames[slot] ?? 'Custom sound' : 'Empty'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleUploadClick(slot)}
              aria-label="Upload sound"
              className="rounded p-1.5 text-text-secondary hover:text-text-primary"
            >
              <Upload className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void handlePreview(slot)}
              disabled={!file}
              aria-label="Preview sound"
              className="rounded p-1.5 text-text-secondary hover:text-text-primary disabled:opacity-40"
            >
              <Play className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void handleClear(slot)}
              disabled={!file}
              aria-label="Clear sound"
              className="rounded p-1.5 text-text-secondary hover:text-muted disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function AboutTab() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="text-xs text-text-secondary">Version</span>
        <p className="text-sm text-text-primary">{packageJson.version}</p>
      </div>

      <div>
        <span className="text-xs text-text-secondary">Source</span>
        <p className="text-sm">
          <a
            href="https://github.com/chidhvilasa/wisp-voice"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            github.com/chidhvilasa/wisp-voice
          </a>
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="rounded-full bg-speaking/20 px-2.5 py-1 text-xs font-medium text-speaking">
          DTLS-SRTP Active
        </span>
        <span className="text-xs text-text-secondary">All voice traffic is end-to-end encrypted</span>
      </div>

      <div>
        <span className="mb-1 block text-xs text-text-secondary">Resource usage</span>
        <ResourceWidget />
      </div>

      <p className="text-xs text-text-secondary">See WISP_PLAN.md in the project root for technical details.</p>
    </div>
  )
}

interface SettingsProps {
  onClose: () => void
}

export default function Settings({ onClose }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('audio')

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex h-[520px] w-[520px] flex-col rounded-card border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded p-1 text-text-secondary hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex border-b border-border px-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-sm font-medium ${
                activeTab === tab.id
                  ? 'border-b-2 border-accent text-text-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'audio' && <AudioTab />}
          {activeTab === 'overlay' && <OverlayTab />}
          {activeTab === 'hotkeys' && <HotkeysTab />}
          {activeTab === 'soundboard' && <SoundboardTab />}
          {activeTab === 'about' && <AboutTab />}
        </div>
      </div>
    </div>
  )
}

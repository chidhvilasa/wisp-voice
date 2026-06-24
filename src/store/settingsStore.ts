import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { HotkeyMap, OverlayMode } from '../types'

const defaultHotkeys: HotkeyMap = {
  mute: 'Ctrl+Shift+M',
  deafen: 'Ctrl+Shift+D',
  overlayToggle: 'Ctrl+Shift+O',
  overlayMode: 'Ctrl+Shift+L',
  soundboard1: 'Ctrl+Shift+1',
  soundboard2: 'Ctrl+Shift+2',
  soundboard3: 'Ctrl+Shift+3',
  soundboard4: 'Ctrl+Shift+4',
  soundboard5: 'Ctrl+Shift+5',
}

interface OverlayPosition {
  x: number
  y: number
}

interface SettingsState {
  inputDevice: string
  outputDevice: string
  micVolume: number
  outputVolume: number
  noiseSuppression: boolean
  echoCancellation: boolean
  audioDucking: boolean
  duckAmount: number
  vadThreshold: number
  pushToTalkEnabled: boolean
  pushToTalkKey: string
  noiseGateEnabled: boolean
  noiseGateThreshold: number
  overlayPosition: OverlayPosition
  overlayMode: OverlayMode
  overlayAutoHide: boolean
  overlayOpacity: number
  hotkeys: HotkeyMap
  launchOnStartup: boolean
  minimizeToTray: boolean
  displayName: string
  soundboardFiles: string[]

  setInputDevice: (deviceId: string) => void
  setOutputDevice: (deviceId: string) => void
  setMicVolume: (volume: number) => void
  setOutputVolume: (volume: number) => void
  setNoiseSuppression: (enabled: boolean) => void
  setEchoCancellation: (enabled: boolean) => void
  setAudioDucking: (enabled: boolean) => void
  setDuckAmount: (amount: number) => void
  setVadThreshold: (threshold: number) => void
  setPushToTalkEnabled: (enabled: boolean) => void
  setPushToTalkKey: (key: string) => void
  setNoiseGateEnabled: (enabled: boolean) => void
  setNoiseGateThreshold: (threshold: number) => void
  setOverlayPosition: (position: OverlayPosition) => void
  setOverlayMode: (mode: OverlayMode) => void
  setOverlayAutoHide: (enabled: boolean) => void
  setOverlayOpacity: (opacity: number) => void
  setHotkeys: (hotkeys: HotkeyMap) => void
  setLaunchOnStartup: (enabled: boolean) => void
  setMinimizeToTray: (enabled: boolean) => void
  setDisplayName: (name: string) => void
  setSoundboardFile: (slot: number, filePath: string) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      inputDevice: '',
      outputDevice: '',
      micVolume: 1.0,
      outputVolume: 1.0,
      noiseSuppression: true,
      echoCancellation: true,
      audioDucking: true,
      duckAmount: 0.2,
      vadThreshold: -50,
      pushToTalkEnabled: false,
      pushToTalkKey: 'Ctrl+Shift+Space',
      noiseGateEnabled: false,
      noiseGateThreshold: -50,
      overlayPosition: { x: 20, y: 20 },
      overlayMode: 'compact',
      overlayAutoHide: true,
      overlayOpacity: 1.0,
      hotkeys: defaultHotkeys,
      launchOnStartup: false,
      minimizeToTray: true,
      displayName: '',
      soundboardFiles: ['', '', '', '', ''],

      setInputDevice: (deviceId) => set({ inputDevice: deviceId }),
      setOutputDevice: (deviceId) => set({ outputDevice: deviceId }),
      setMicVolume: (volume) => set({ micVolume: volume }),
      setOutputVolume: (volume) => set({ outputVolume: volume }),
      setNoiseSuppression: (enabled) => set({ noiseSuppression: enabled }),
      setEchoCancellation: (enabled) => set({ echoCancellation: enabled }),
      setAudioDucking: (enabled) => set({ audioDucking: enabled }),
      setDuckAmount: (amount) => set({ duckAmount: amount }),
      setVadThreshold: (threshold) => set({ vadThreshold: threshold }),
      setPushToTalkEnabled: (enabled) => set({ pushToTalkEnabled: enabled }),
      setPushToTalkKey: (key) => set({ pushToTalkKey: key }),
      setNoiseGateEnabled: (enabled) => set({ noiseGateEnabled: enabled }),
      setNoiseGateThreshold: (threshold) => set({ noiseGateThreshold: threshold }),
      setOverlayPosition: (position) => set({ overlayPosition: position }),
      setOverlayMode: (mode) => set({ overlayMode: mode }),
      setOverlayAutoHide: (enabled) => set({ overlayAutoHide: enabled }),
      setOverlayOpacity: (opacity) => set({ overlayOpacity: opacity }),
      setHotkeys: (hotkeys) => set({ hotkeys }),
      setLaunchOnStartup: (enabled) => set({ launchOnStartup: enabled }),
      setMinimizeToTray: (enabled) => set({ minimizeToTray: enabled }),
      setDisplayName: (name) => set({ displayName: name }),
      setSoundboardFile: (slot, filePath) =>
        set((state) => {
          const soundboardFiles = [...state.soundboardFiles]
          soundboardFiles[slot] = filePath
          return { soundboardFiles }
        }),
    }),
    {
      name: 'wisp-settings',
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<SettingsState>
        return {
          ...currentState,
          ...persisted,
          hotkeys: { ...currentState.hotkeys, ...(persisted.hotkeys ?? {}) },
        }
      },
    },
  ),
)

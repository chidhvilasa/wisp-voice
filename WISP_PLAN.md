# WISP Build Plan

## What we are building
Lightweight gaming voice chat. Desktop app. Tauri v2. Not a browser.
Target: <50MB RAM, <1% CPU idle, 4 person rooms, E2E encrypted.

## Hard rules
- Never inject into game processes
- Never hook DirectX or OpenGL
- No Electron
- Overlay = OS-level Tauri alwaysOnTop window only
- TypeScript strict mode. No any. No @ts-ignore.
- Free infrastructure only
- Every phase commits and pushes before moving on

## ICE servers (use in every RTCPeerConnection)
stun:stun.l.google.com:19302
stun:stun1.l.google.com:19302
turn:openrelay.metered.ca:80 (user: openrelayproject / pass: openrelayproject)
turn:openrelay.metered.ca:443 (user: openrelayproject / pass: openrelayproject)

## Design tokens
Background: #0E0E10
Surface: #1A1A1E
Accent: #7C5CFC
Speaking: #22C55E
Muted: #EF4444
Text: #F4F4F5 / #A1A1AA
Font: Inter

## Phase 2 - Signaling server
Cloudflare Workers + Durable Objects in /server directory
- POST /room returns 6-char room code
- WS /room/:code/ws for WebSocket connections
- Max 4 peers per room, reject 5th
- Relay offer/answer/ice-candidate between peers
- Rate limit 10 msg/sec per peer
- Auto-destroy room when empty
- wrangler.toml configured for deploy
- server/README.md with deploy steps

## Phase 3 - WebRTC engine
src/lib/webrtc.ts - WispVoiceEngine class
- connect(roomCode, displayName)
- disconnect()
- setMuted(muted)
- setDeafened(deafened)
- setPeerVolume(peerId, volume 0-2.0)
- getStats() - RTT per peer every 2s
- Events: peer-joined, peer-left, speaking, connection-state-change, chat-message, error
- Full mesh RTCPeerConnection (max 3 remote peers)
- getUserMedia: echoCancellation, noiseSuppression, autoGainControl, 48kHz mono
- Per-peer GainNode for individual volume
- DataChannel wisp-chat for text messages
- Clean teardown

src/lib/vad.ts - VADProcessor class
- AnalyserNode RMS detection
- 200ms hysteresis
- Default threshold -50dB

src/store/voiceStore.ts - Zustand store
src/store/settingsStore.ts - Zustand store persisted to localStorage

Tests in src/lib/webrtc.test.ts - must pass before commit

## Phase 4 - Audio pipeline
src/worklets/rnnoise-processor.ts - AudioWorklet
src/lib/audio.ts - AudioPipeline class
src/lib/devices.ts - device enumeration
Pipeline: MediaStreamSource → RNNoise → GainNode → WebRTC
Audio ducking: 50ms ramp down, 200ms ramp up when peer speaks

## Phase 5 - Overlay window
Second Tauri window: transparent, alwaysOnTop, no decorations
Compact mode: 28px circles, green pulse speaking, ping dots
Full mode: peer cards with VAD rings, signal bars, latency
Auto-hide: fade to 0 opacity after 3s silence, snap back instantly
Drag and snap to corners

## Phase 6 - Tray + hotkeys + room management
System tray with mic/mute/deafen icons
Global hotkeys: Ctrl+Shift+M mute, Ctrl+Shift+D deafen, Ctrl+Shift+O overlay
Room codes: 6-char alphanumeric
Recent rooms: last 5 in localStorage
Auto-reconnect: exponential backoff 1s 2s 4s 8s 30s max
Room lock by host

## Phase 7 - Main UI
Home page: create/join room, recent rooms, live resource widget (CPU + RAM)
Room page: peer grid 2x2, speaking rings, per-peer volume, text chat
Settings: audio, overlay, hotkeys, soundboard, about + resource monitor

## Phase 8 - Polish and security
CSP headers in tauri.conf.json
Audit Tauri allowlist permissions
ErrorBoundary on all routes
Confirm DTLS-SRTP active
Memory leak check
Disable console.log in production

## Phase 9 - CI/CD and release
GitHub Actions ci.yml: type-check + vitest + build on every push
GitHub Actions release.yml: build for Windows/Mac/Linux on tag v*.*.*
GitHub Release v0.1.0 with all three platform binaries

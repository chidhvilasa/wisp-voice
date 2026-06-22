# Wisp — Lightweight Gaming Voice Chat

## Identity
Desktop app. NOT a browser app. Installable binary on Windows, Mac, Linux.
Name: Wisp. Tagline: "Voice that doesn't slow you down."

## Hard Constraints (never violate these)
- NEVER inject into any game process
- NEVER hook DirectX, OpenGL, or any graphics pipeline
- NEVER use kernel-level drivers
- Overlay is ONLY an OS-level always-on-top transparent Tauri window
- All audio via Web Audio API and WebRTC exclusively
- No Electron. Ever. Tauri v2 only.
- No paid infrastructure. Everything runs on free tiers.
- TypeScript strict mode. No `any`. No `@ts-ignore`.
- Every phase ends with a commit and push before moving on.

## Tech Stack
- Desktop runtime: Tauri v2 (Rust backend, React frontend)
- Frontend: React 18 + TypeScript + Tailwind CSS + shadcn/ui + Vite
- State: Zustand (persisted to localStorage where noted)
- WebRTC: native RTCPeerConnection + simple-peer
- Audio processing: Web Audio API + RNNoise (rnnoise-wasm, AudioWorklet)
- Signaling: Cloudflare Workers + Durable Objects (WebSocket)
- STUN: stun:stun.l.google.com:19302 (free)
- TURN: openrelay.metered.ca (free public relay)
- Hotkeys: tauri-plugin-global-shortcut
- Tray: Tauri system tray API
- Logging: tauri-plugin-log
- Autostart: tauri-plugin-autostart
- Testing: Vitest

## Design Tokens
Background:    #0E0E10
Surface:       #1A1A1E
Surface2:      #26262C
Accent:        #7C5CFC
AccentHover:   #6B4EE6
Speaking:      #22C55E
Muted:         #EF4444
Warning:       #F59E0B
TextPrimary:   #F4F4F5
TextSecondary: #A1A1AA
Border:        rgba(255,255,255,0.08)
Radius:        8px standard, 12px cards
Font:          Inter

## ICE Server Config (use in every RTCPeerConnection)
[
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" }
]

## File Structure
wisp-voice/
  src/
    components/       shared UI components
    pages/            Home.tsx, Room.tsx, Settings.tsx
    overlay/          Overlay.tsx (renders in second Tauri window)
    hooks/            useVoice.ts, useVAD.ts, useHotkeys.ts
    store/            voiceStore.ts, settingsStore.ts
    lib/              webrtc.ts, audio.ts, vad.ts, rooms.ts, devices.ts
    types/            index.ts (all shared TS interfaces)
    worklets/         rnnoise-processor.ts
    router.tsx        hash-based: #/app = main, #/overlay = overlay
  src-tauri/
    src/
      main.rs
      commands/       overlay.rs, hotkeys.rs, tray.rs, sysinfo.rs
  server/             Cloudflare Workers signaling server
  .github/
    workflows/        ci.yml, release.yml
  WISP_PLAN.md
  README.md

## Phase Report Format
After completing each phase output exactly this:

PHASE [N] COMPLETE
Files created: [list]
Files modified: [list]
Commands run: [list]
Verified: [what was tested and result]
Issues: [none OR description + how resolved]
Ready for Phase [N+1]: yes

---

## PHASE 1 — Scaffold + Repo + Plan

Steps:
1. gh repo create wisp-voice --public --clone
2. cd wisp-voice
3. npm create tauri-app@latest . -- --template react-ts --yes
4. npm install tailwindcss @tailwindcss/vite inter-font
5. npm install zustand simple-peer lucide-react
6. npm install -D vitest @vitest/ui
7. npx shadcn@latest init (default config, dark theme)
8. npm install --save-dev @types/simple-peer
9. npx tauri add global-shortcut
10. npx tauri add log
11. Configure tailwind.config.ts with all design tokens above
12. Create src/router.tsx with hash router: #/app renders App, #/overlay renders Overlay placeholder
13. Create src/types/index.ts with these interfaces:
    - Peer { id, name, muted, deafened, speaking, quality, latencyMs }
    - ConnectionState: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'
    - ConnectionQuality: 'good' | 'ok' | 'poor'
    - ChatMessage { id, from, content, timestamp }
    - Room { code, name, locked, hostId, peers }
    - HotkeyMap { mute, deafen, overlayToggle, overlayMode, soundboard1-5 }
    - OverlayMode: 'compact' | 'full'
14. Create .env.example:
    VITE_SIGNALING_URL=
    VITE_STUN_URL=stun:stun.l.google.com:19302
    VITE_TURN_URL=openrelay.metered.ca
15. Create .gitignore: node_modules, target, dist, .env, *.pem, *.key, *.DS_Store
16. Write README.md with: project description, tech stack table, resource comparison
    (Wisp target: <50MB RAM / <1% CPU idle vs Discord: ~400MB RAM / 3-8% CPU idle),
    build instructions, signaling server deploy instructions, CI badge placeholder
17. Write WISP_PLAN.md to disk (this file)
18. git add -A && git commit -m "phase 1: project scaffold" && git push origin main

Verify: npm run tauri dev opens a window without errors. Screenshot the terminal output in the report.

## PHASE 2 — Signaling Server (Cloudflare Workers)

Directory: /server (inside wisp-voice repo)

Steps:
1. cd server && npm create cloudflare@latest . -- --type durable-object-worker --ts
2. Implement src/index.ts with:
   - Durable Object class: WispRoom
     - Max 4 peers, reject 5th with { type: "room-full" }
     - State: Map<string, WebSocket> peers
     - Message relay: route by `to` field between peers in same room
     - Auto-destroy after all peers disconnect
     - Rate limit: drop if peer sends >10 msg/sec
   - Worker fetch handler:
     - POST /room → generate 6-char alphanumeric code, create DO instance, return { code }
     - GET /room/:code/ws → WebSocket upgrade, forward to DO
3. Message types handled: join, offer, answer, ice-candidate, peer-joined, peer-left, room-full, room-locked, error
4. wrangler.toml: name = "wisp-signaling", durable_objects binding
5. server/README.md: exact steps to deploy (wrangler login, wrangler deploy)
6. Add server test: server/src/index.test.ts using Vitest — mock WebSocket, confirm relay logic
7. cd .. && git add -A && git commit -m "phase 2: signaling server" && git push origin main

Verify: wrangler dev --local, connect two wscat clients to the same room code,
confirm an offer from peer A appears at peer B.

## PHASE 3 — WebRTC Voice Engine + VAD

Files: src/lib/webrtc.ts, src/lib/vad.ts, src/store/voiceStore.ts, src/store/settingsStore.ts

webrtc.ts — class WispVoiceEngine extends EventEmitter:
  connect(roomCode, displayName): Promise<void>
  disconnect(): void
  setMuted(muted: boolean): void
  setDeafened(deafened: boolean): void
  setPeerVolume(peerId, volume): void  // 0–2.0
  getStats(): Promise<Map<string, PeerStats>>
  Events emitted: peer-joined, peer-left, speaking, connection-state-change, chat-message, error
  - One RTCPeerConnection per remote peer (full mesh, max 3 remote peers)
  - Use ICE config from WISP_PLAN.md
  - getUserMedia: { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000, channelCount: 1 }, video: false }
  - Per-peer GainNode for individual volume control
  - getStats() every 2s: measure RTT, classify ConnectionQuality
  - DataChannel "wisp-chat" per peer connection for text messages
  - Clean teardown: close all RTCPeerConnection, stop all tracks, disconnect WebSocket

vad.ts — class VADProcessor:
  init(stream: MediaStream): void
  destroy(): void
  Events: speaking(isSpeaking: boolean) — debounced 200ms hysteresis
  Uses AnalyserNode RMS, threshold configurable, default -50dB

voiceStore.ts (Zustand):
  roomCode, displayName, peers: Map<string,Peer>, localMuted, localDeafened,
  connectionState: ConnectionState, chatMessages: ChatMessage[]
  Actions: joinRoom, leaveRoom, toggleMute, toggleDeafen, setPeerVolume, sendChat

settingsStore.ts (Zustand, persist to localStorage):
  inputDevice, outputDevice, micVolume(1.0), outputVolume(1.0),
  noiseSuppression(true), echoCancellation(true), audioDucking(true), duckAmount(0.2),
  vadThreshold(-50), overlayPosition({x:20,y:20}), overlayMode('compact'),
  overlayAutoHide(true), overlayOpacity(1.0), hotkeys: HotkeyMap (defaults),
  launchOnStartup(false), minimizeToTray(true), displayName('')

Test: src/lib/webrtc.test.ts using Vitest
  - Mock signaling WebSocket
  - Two WispVoiceEngine instances exchange SDP and reach 'connected'
  Run: npx vitest run — must pass before commit

git add -A && git commit -m "phase 3: webrtc engine + vad" && git push origin main

Verify: npx vitest run — all tests green. Report test output.

## PHASE 4 — Audio Processing Pipeline

Files: src/lib/audio.ts, src/worklets/rnnoise-processor.ts

Steps:
1. npm install rnnoise-wasm
2. src/worklets/rnnoise-processor.ts — AudioWorkletProcessor:
   - Processes 480 samples/frame at 48kHz (RNNoise requirement)
   - Input: Float32Array mono 48kHz
   - Output: denoised Float32Array
   - Skip processing when noise suppression disabled
3. src/lib/audio.ts — class AudioPipeline:
   init(stream: MediaStream): Promise<ProcessedStream>
   setNoiseSuppression(enabled: boolean): void
   setMicVolume(volume: number): void       // 0–2.0
   setOutputVolume(volume: number): void    // 0–2.0 master
   setDucked(ducked: boolean, amount: number): void
     — smooth 50ms ramp down, 200ms ramp up (linearRampToValueAtTime)
   destroy(): void
   Pipeline: MediaStreamSource → RNNoiseWorklet → MicGainNode → Destination
4. src/lib/devices.ts:
   getInputDevices(): Promise<MediaDeviceInfo[]>
   getOutputDevices(): Promise<MediaDeviceInfo[]>
   Handle PermissionDeniedError with user-friendly message

Integrate AudioPipeline into WispVoiceEngine from Phase 3.
Update voiceStore to call setDucked when any peer emits speaking=true.

git add -A && git commit -m "phase 4: audio pipeline + rnnoise" && git push origin main

Verify: Run dev mode, speak into mic, confirm RNNoise worklet loads (no console errors),
confirm mic volume slider affects level. Report console output.

## PHASE 5 — Overlay Window

Files: src/overlay/Overlay.tsx, src-tauri/src/commands/overlay.rs, tauri.conf.json

tauri.conf.json — add second window:
{
  label: "overlay", title: "", width: 220, height: 200,
  decorations: false, transparent: true, alwaysOnTop: true,
  skipTaskbar: true, visible: false, resizable: false,
  x: 20, y: 20, focus: false
}

overlay.rs — Tauri commands:
  show_overlay(), hide_overlay()
  set_overlay_position(x: i32, y: i32)  — persists to app data dir as overlay_pos.json
  get_overlay_position() -> (i32, i32)

Overlay.tsx — two modes:

COMPACT MODE:
  Row of 28px circles, one per peer + self
  Green pulse CSS animation when speaking, gray silent, red mic-slash when muted
  3px ping dot per circle: green <80ms, yellow 80–200ms, red >200ms
  8px lock icon bottom-right when E2E confirmed

FULL MODE:
  Card per peer: avatar initials circle, display name, VAD ring
  Speaking: box-shadow pulse green animation
  Muted: mic-off icon, no ring
  3-bar signal strength + latency text "42ms"

AUTO-HIDE:
  overlayAutoHide=true: opacity 0 after 3s of all silent (transition: opacity 0.3s)
  Snap back to full opacity in 0.1s on any speaking event

DRAG + SNAP:
  mousedown/mousemove drag, on mouseup snap to nearest corner with 16px padding
  Call set_overlay_position after snap

CROSS-WINDOW SYNC:
  Main window emits Tauri events: peers-updated, speaking-changed, mute-changed
  Overlay window listens and updates local React state

git add -A && git commit -m "phase 5: overlay window" && git push origin main

Verify: Run dev, open a fullscreen browser window, confirm overlay stays on top,
drag-to-corner works, auto-hide triggers correctly. Report observations.

## PHASE 6 — Tray + Hotkeys + Room Management

Files: src-tauri/src/commands/tray.rs, src-tauri/src/commands/hotkeys.rs, src/lib/rooms.ts

tray.rs:
  Icon states: normal mic, mic-slash (muted), headphones-slash (deafened)
  Right-click menu: Open Wisp | Mute toggle | Deafen toggle | --- | Leave Room | --- | Quit
  Left-click: show/hide main window

hotkeys.rs (tauri-plugin-global-shortcut):
  Default bindings:
    Ctrl+Shift+M → toggle mute
    Ctrl+Shift+D → toggle deafen
    Ctrl+Shift+O → toggle overlay visibility
    Ctrl+Shift+L → toggle overlay mode compact/full
    Ctrl+Shift+1..5 → soundboard slots
  Read bindings from settingsStore hotkeys config
  On registration failure: log warning, do not crash

rooms.ts:
  createRoom(): Promise<string>  — POST to signaling, return 6-char code
  joinRoom(code: string): Promise<void>
  lockRoom(): void  — sends room-locked signal via DataChannel to all peers
  Recent rooms: persist last 5 to localStorage as RecentRoom[]
    { code, name, lastUsed: number, memberCount: number }
  Auto-reconnect: exponential backoff 1s→2s→4s→8s→30s cap
    Emit 'reconnecting' state during retries, 'error' after 5 failed attempts

git add -A && git commit -m "phase 6: tray, hotkeys, room management" && git push origin main

Verify: Test all hotkeys while a fullscreen window is active.
Test tray context menu. Confirm recent rooms persist after restart. Report.

## PHASE 7 — Main Window UI

Pages: src/pages/Home.tsx, src/pages/Room.tsx, src/pages/Settings.tsx
Design spec: all tokens from this plan, dark theme, no light mode

Home.tsx:
  Logo + tagline
  "Create Room" button → calls createRoom(), shows 6-char code with copy button
  "Join Room" input (6-char) + Join button
  Recent rooms list: code, last used date, member count, Rejoin button
  Resource widget bottom-right: live CPU% + RAM MB from sysinfo Tauri command,
    update every 2s. Show comparison: "Discord ~400MB / Wisp Xmb"

Room.tsx:
  Room code top with copy button + Lock button (host only)
  Peer grid 2x2: avatar circle, name, speaking ring, muted/deafened icons,
    signal bars, ping ms, per-peer volume slider 0–200% (visible on hover)
  Bottom toolbar: mic toggle, deafen, settings, leave room
  Collapsible text chat panel (right side, DataChannel messages)

Settings.tsx (modal over current page):
  Audio: input/output device dropdowns, mic volume 0–200%, output volume 0–200%,
    noise suppression toggle, echo cancellation toggle,
    audio ducking toggle + amount slider, VAD sensitivity slider
  Overlay: show/hide, compact/full toggle, auto-hide toggle,
    opacity slider 30–100%, corner picker (4-button visual selector)
  Hotkeys: table of action + current binding, click to rebind
  App: launch on startup toggle, minimize to tray toggle, display name input
  Soundboard: 5 slots, each has upload button (WAV/MP3 max 2MB),
    preview button, hotkey label, clear button. Files in Tauri app data dir.
  About: version, GitHub link, E2E status badge,
    live resource comparison widget (same as Home)

Add src-tauri/src/commands/sysinfo.rs:
  get_app_resource_usage() -> { cpu_percent: f32, ram_mb: u64 }
  Uses sysinfo crate, filters by current process PID

git add -A && git commit -m "phase 7: main window UI" && git push origin main

Verify: Full user flow — create room, join from second instance, chat works,
all settings persist on restart, resource widget updates live. Report.

## PHASE 8 — Polish + Security + Performance

1. Performance:
   Profile idle RAM target <50MB. Profile RNNoise worklet CPU <2%.
   Fix any memory leaks found via Chrome DevTools Memory tab.
   Verify no audio glitches at 48kHz Opus.

2. Error handling:
   ErrorBoundary on all routes. All WebRTC errors → user-friendly string, never raw JS.
   All Tauri command errors caught and logged.

3. Security:
   Confirm DTLS-SRTP active: log ICE transport DTLS state in dev mode.
   Set CSP in tauri.conf.json.
   Audit Tauri allowlist — remove any unused permissions.
   Confirm signaling server stores zero user data (ephemeral relay only).

4. Logging:
   tauri-plugin-log: log connection events, ICE state, errors only.
   Disable all console.log in production builds.
   Never log audio data or message content.

5. Accessibility:
   aria-labels on all interactive elements.
   Full keyboard navigation.

6. Update README: add architecture diagram (ASCII), add performance benchmark section.

git add -A && git commit -m "phase 8: polish, security, performance" && git push origin main

Verify: Memory profiling results in report. DTLS confirmation in report.

## PHASE 9 — GitHub Actions + Cross-Platform Release

.github/workflows/ci.yml — triggers on every push/PR to main:
  npm ci → npm run type-check → npx vitest run → npm run build (frontend only)
  Adds green CI badge to README

.github/workflows/release.yml — triggers on tag v*.*.*:
  Matrix: ubuntu-latest (.AppImage, .deb), windows-latest (.msi, .exe), macos-latest (.dmg)
  Each runner: checkout → Node 20 → Rust stable → platform deps → npm ci → npm run tauri build → upload to GitHub Release
  Ubuntu deps: libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

Create GitHub Release v0.1.0:
  Tag: v0.1.0
  Title: Wisp v0.1.0
  Body: feature list, install instructions per platform, signaling deploy steps

Update README: CI badge, download badges for each platform.

git add -A && git commit -m "phase 9: CI/CD + release workflow" && git push origin main
git tag v0.1.0 && git push origin v0.1.0

Verify: CI workflow runs green. Release workflow produces binaries for all 3 platforms.
Download Windows .msi, install, confirm app launches. Report binary sizes.

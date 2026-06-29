# Wisp

**Voice that doesn't slow you down.**

Wisp is a lightweight desktop voice chat app built for gaming. Real installable binary for Windows, Mac, and Linux. Not a browser app. Not Electron. No game process injection, no graphics hooks, no kernel drivers. Just fast peer-to-peer voice with a minimal always-on-top overlay.

![CI](https://github.com/chidhvilasa/wisp-voice/actions/workflows/ci.yml/badge.svg)

---

## Download

| Platform | Download |
|---|---|
| Windows | [Wisp_0.4.0_x64-setup.exe](https://github.com/chidhvilasa/wisp-voice/releases/download/v0.4.0/Wisp_0.4.0_x64-setup.exe) |
| macOS (Intel + Apple Silicon) | [Wisp_0.4.0_universal.dmg](https://github.com/chidhvilasa/wisp-voice/releases/download/v0.4.0/Wisp_0.4.0_universal.dmg) |
| Linux | [Wisp_0.4.0_amd64.AppImage](https://github.com/chidhvilasa/wisp-voice/releases/download/v0.4.0/Wisp_0.4.0_amd64.AppImage) |

[All releases →](https://github.com/chidhvilasa/wisp-voice/releases)

---

## Why Wisp

Discord uses ~400MB RAM and 3-8% CPU while idle. Wisp uses ~42MB RAM and under 1% CPU. Built specifically because Discord's Electron overhead causes frame drops during games on lower-end machines.

| | Wisp | Discord |
|---|---|---|
| RAM idle | ~42 MB | ~400 MB |
| CPU idle | < 1% | 3–8% |
| Install size | ~10 MB | ~300 MB |
| Overlay | OS-level, EAC-safe | DirectX hook |
| Max room size | 4 people | unlimited |
| Accounts required | none | required |

---

## Features

- **Peer-to-peer voice** — E2E encrypted via DTLS-SRTP, built into WebRTC
- **In-game overlay** — transparent always-on-top window, EAC-safe, auto-hides when silent
- **Compact and full overlay modes** — draggable, snaps to any screen corner
- **Up to 4 people** — room codes, no accounts, no servers storing your data
- **Mute and deafen sync** — both states broadcast to all peers in real time
- **Per-peer volume** — adjust each person individually 0–200%
- **Push to talk** — Caps Lock by default, fully rebindable
- **Noise suppression** — browser-native AEC, AGC, and noise gating
- **Audio ducking** — game audio lowers when someone speaks
- **Discord-style sounds** — join, leave, mute, unmute, message notifications
- **Text chat** — via WebRTC DataChannel, no server needed
- **Soundboard** — 5 bindable audio slots
- **Global hotkeys** — work while any game is focused
- **System tray** — mute and deafen without leaving your game
- **Auto-updater** — updates install in the background
- **Works on Jio CGNAT** — ExpressTURN relay ensures connection even on carrier-grade NAT

---

## Install

### Windows

Download and run `Wisp_0.4.0_x64-setup.exe`.

Windows SmartScreen may show a warning because Wisp is not yet code-signed. Click **More info** then **Run anyway**. Wisp is fully open source — you can review every line of code in this repo.

### macOS

**One-command install:**
```bash
curl -L https://github.com/chidhvilasa/wisp-voice/releases/download/v0.4.0/Wisp_0.4.0_universal.dmg -o /tmp/Wisp.dmg && hdiutil attach /tmp/Wisp.dmg && sudo cp -r "/Volumes/Wisp/Wisp.app" /Applications/ && sudo xattr -cr /Applications/Wisp.app && hdiutil detach "/Volumes/Wisp" && open /Applications/Wisp.app
```

macOS will block the app on first launch because it is not signed with an Apple Developer certificate. To open it:

1. Right-click `Wisp.app` in Finder → **Open** → **Open**
2. Or run: `sudo xattr -cr /Applications/Wisp.app`
3. Or go to **System Settings → Privacy & Security** → scroll down → **Open Anyway**

After opening once, macOS remembers and will not block it again.

Grant microphone permission when prompted: **System Settings → Privacy & Security → Microphone → enable Wisp**.

### Linux

Download `Wisp_0.4.0_amd64.AppImage`, make it executable, and run it:
```bash
chmod +x Wisp_0.4.0_amd64.AppImage
./Wisp_0.4.0_amd64.AppImage
```

---

## How it works

```
[Wisp App] ──WebSocket──► [Cloudflare Workers]  (signaling only, ephemeral)
     │                           │
     └──────WebRTC P2P───────────┘  (direct after handshake)
            DTLS-SRTP encrypted
            TURN relay via ExpressTURN if P2P fails (Jio CGNAT etc.)
```

1. One person clicks **Create Room** — a 6-character code is generated
2. Friends enter the code in **Join Room**
3. The Cloudflare signaling server introduces the peers
4. WebRTC establishes direct P2P audio — signaling server is no longer involved
5. If P2P fails (CGNAT, strict firewall), ExpressTURN relay is used automatically

---

## Tech stack

| Layer | Technology |
|---|---|
| Desktop runtime | Tauri v2 (Rust + WebView) |
| Frontend | React 18 + TypeScript + Tailwind CSS |
| Voice transport | WebRTC (Opus codec, DTLS-SRTP) |
| Signaling | Cloudflare Workers + Durable Objects |
| TURN relay | ExpressTURN (primary) + OpenRelay (fallback) |
| Noise suppression | Web Audio API AEC + AGC |
| State | Zustand |
| Testing | Vitest (59 tests) |
| CI/CD | GitHub Actions (Windows + macOS + Linux) |

---

## Build from source

Prerequisites: [Rust](https://rustup.rs), Node.js 20+

```bash
git clone https://github.com/chidhvilasa/wisp-voice
cd wisp-voice
npm install
cp .env.example .env
# Edit .env and set VITE_SIGNALING_URL
npm run tauri dev
```

To build a release binary:
```bash
npm run tauri build
```

### Deploy the signaling server

```bash
cd server
npm install
wrangler login
wrangler deploy
```

Set the deployed URL as `VITE_SIGNALING_URL` in your `.env`.

---

## Security

- All voice is E2E encrypted via DTLS-SRTP (built into WebRTC — not optional)
- Signaling server stores zero data — ephemeral relay only, rooms destroy on disconnect
- TURN credentials are server-side only — never shipped in the app binary
- No accounts, no telemetry, no analytics, no stored messages
- App binary is signed with a Tauri updater key — updates are verified before installing
- See [SECURITY.md](SECURITY.md) for full details and known limitations

---

## Known issues

- Windows SmartScreen warning — app is unsigned. Click More info → Run anyway.
- macOS Gatekeeper block — app is unsigned. See install instructions above.
- RNNoise ML noise suppression is currently a no-op (the npm package is a stub). Browser-native noise suppression is active. A real RNNoise WASM binary can be dropped in with no code changes.
- TURN relay uses ExpressTURN free tier (1000 GB/month). More than enough for personal use.

---

## Contributing

Open issues and PRs welcome. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for the current list of open items.

---

*Built with Tauri v2. macOS and Linux builds are cross-compiled via GitHub Actions.*

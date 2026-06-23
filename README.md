# Wisp

**Voice that doesn't slow you down.**

Wisp is a lightweight, desktop-only voice chat app built for gamers. It is a real, installable binary for Windows, Mac, and Linux — not a browser app, not Electron. No game process injection, no graphics-pipeline hooks, no kernel drivers. Just a fast peer-to-peer voice client with a minimal always-on-top overlay.

[![CI](https://github.com/chidhvilasa/wisp-voice/actions/workflows/ci.yml/badge.svg)](https://github.com/chidhvilasa/wisp-voice/actions/workflows/ci.yml)

## Tech Stack

| Layer | Choice |
|---|---|
| Desktop runtime | Tauri v2 (Rust backend, React frontend) |
| Frontend | React 18 + TypeScript + Tailwind CSS + shadcn/ui + Vite |
| State | Zustand |
| WebRTC | Native RTCPeerConnection + simple-peer |
| Audio | Web Audio API + RNNoise (AudioWorklet) |
| Signaling | Cloudflare Workers + Durable Objects (WebSocket) |
| STUN/TURN | Google STUN (free) + openrelay.metered.ca (free) |
| Hotkeys | tauri-plugin-global-shortcut |
| Logging | tauri-plugin-log |
| Testing | Vitest |

## Resource Usage (target)

| | Wisp (target) | Discord |
|---|---|---|
| RAM (idle) | < 50 MB | ~400 MB |
| CPU (idle) | < 1% | 3-8% |

## Project Structure

```
src/            React frontend (components, pages, overlay, hooks, store, lib, types, worklets)
src-tauri/      Rust backend (Tauri commands, window/tray/hotkey management)
server/         Cloudflare Workers signaling server
.github/        CI/CD workflows
```

## Build Instructions

Prerequisites: Node.js 20+, Rust stable, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
npm install
npm run tauri dev    # run in development
npm run tauri build  # produce a release binary
```

## Signaling Server

The signaling server lives in `server/` and deploys to Cloudflare Workers free tier:

```bash
cd server
npm install
npx wrangler login
npx wrangler deploy
```

Set `VITE_SIGNALING_URL` in `.env` to the deployed Worker URL (see `.env.example`).

## Testing

```bash
npx vitest run
```

## Security

- All voice is end-to-end encrypted via DTLS-SRTP, built into WebRTC — no custom crypto, no plaintext audio ever leaves the device.
- The signaling server is an ephemeral relay only: it brokers connection setup and stores zero data.
- A strict Content-Security-Policy is enforced via Tauri's security config to limit script, network, and media sources.
- No telemetry, no analytics, no accounts required.

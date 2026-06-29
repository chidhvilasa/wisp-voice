# Security

## Encryption

All voice and chat data is end-to-end encrypted via DTLS-SRTP, which is built into WebRTC itself — there is no custom crypto layer and no plaintext audio or chat content ever leaves the device unencrypted. Once two peers complete the WebRTC handshake, the signaling server is no longer involved in the conversation and never sees decrypted media.

## Signaling server

The signaling server (`server/`, deployed on Cloudflare Workers) is an ephemeral relay only:

- It brokers room creation and the WebRTC offer/answer/ICE-candidate exchange.
- It stores no chat content, no audio, and no message history.
- A room's Durable Object storage holds nothing beyond a boolean "room exists" flag, which is deleted once the room is empty.
- Signaling messages are rate-limited per connection to mitigate abuse.

## TURN credentials

TURN relay credentials (ExpressTURN, and the OpenRelay fallback) are stored as encrypted Cloudflare Worker secrets and served to the client at connect time via a rate-limited `/ice-servers` endpoint. They are never hardcoded in the client bundle, so they cannot be extracted from the installed app. The endpoint responds with `Cache-Control: no-store` so credentials are never cached.

## Content Security Policy

The desktop app enforces a strict Content-Security-Policy via Tauri's security configuration, limiting which script, network, and media sources the webview is allowed to load or connect to.

## No accounts, no telemetry

Wisp has no account system, no analytics, and no telemetry. The only data persisted is local app settings (stored on-device) and a short list of recently-used room codes (also on-device, never sent anywhere).

## Known limitations

- The free-tier TURN relay (ExpressTURN/OpenRelay) has no uptime or bandwidth guarantee. It's suitable for personal use, not large-scale production traffic.
- The Windows and macOS release binaries are not yet signed with a paid code-signing certificate, which triggers OS warnings (SmartScreen / Gatekeeper) on first install. The app itself is open source and auditable in this repo.
- Auto-updates are verified against a Tauri-generated signing key before being installed, but the update channel (GitHub Releases) relies on GitHub's own infrastructure integrity.

## Reporting a vulnerability

If you find a security issue, please open a GitHub issue on this repo describing the problem. This is a small open-source project without a dedicated security contact, so issues are the fastest way to reach the maintainer.

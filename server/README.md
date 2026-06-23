# Wisp Signaling Server

Cloudflare Workers + Durable Objects. Ephemeral relay only. Zero data persistence.

## Deploy

1. Install wrangler: npm install -g wrangler
2. Login: wrangler login
3. cd server
4. Deploy: npx wrangler deploy

## Local dev

npx wrangler dev

Test with wscat:
  wscat -c "ws://localhost:8787/room/ABC123/ws"

## Architecture

- POST /room → creates room, returns 6-char code
- WS /room/:code/ws → joins room WebSocket
- Max 4 peers per room
- All messages are ephemeral relay only
- Room auto-destroys when all peers disconnect
- Rate limited to 10 messages/second per peer

## Message types

Client → Server:
  { type: "offer", to: "peerId", sdp: {} }
  { type: "answer", to: "peerId", sdp: {} }
  { type: "ice-candidate", to: "peerId", candidate: {} }
  { type: "room-locked" }

Server → Client:
  { type: "joined", peerId: "abc", existingPeers: [] }
  { type: "peer-joined", peerId: "abc" }
  { type: "peer-left", peerId: "abc" }
  { type: "room-full" }

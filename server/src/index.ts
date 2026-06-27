export interface Env {
  WISP_ROOM: DurableObjectNamespace
}

const ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const PEER_ID_CHARS = '0123456789abcdef'
const MAX_PEERS_PER_ROOM = 4
const RATE_LIMIT_WINDOW_MS = 1000
const RATE_LIMIT_MAX_MESSAGES = 10
const RELAY_MESSAGE_TYPES = new Set(['offer', 'answer', 'ice-candidate', 'room-locked', 'chat'])

export function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
  }
  return code
}

export function generatePeerId(): string {
  let id = ''
  for (let i = 0; i < 8; i++) {
    id += PEER_ID_CHARS[Math.floor(Math.random() * PEER_ID_CHARS.length)]
  }
  return id
}

export class WispRoom {
  private peers: Map<string, WebSocket> = new Map()
  private rateLimits: Map<string, number[]> = new Map()
  private state: DurableObjectState

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // idFromName() derives a Durable Object deterministically from the room
    // code string, so any 6-character code "exists" as far as the runtime
    // is concerned even if nobody ever called POST /room for it. This marker
    // is the only signal that distinguishes a real room from a guessed code.
    if (request.method === 'POST' && url.pathname === '/create') {
      await this.state.storage.put('created', true)
      return new Response(null, { status: 204 })
    }

    const upgradeHeader = request.headers.get('Upgrade')
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected websocket', { status: 400 })
    }

    const created = await this.state.storage.get('created')
    if (!created) {
      return new Response('Room not found', { status: 404 })
    }

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.handleSession(server)

    return new Response(null, { status: 101, webSocket: client })
  }

  handleSession(ws: WebSocket): void {
    if (this.peers.size >= MAX_PEERS_PER_ROOM) {
      ws.accept()
      ws.send(JSON.stringify({ type: 'room-full' }))
      ws.close()
      return
    }

    ws.accept()

    const peerId = generatePeerId()
    const existingPeers = Array.from(this.peers.keys())
    this.peers.set(peerId, ws)

    ws.send(JSON.stringify({ type: 'joined', peerId, existingPeers }))
    this.broadcast({ type: 'peer-joined', peerId }, peerId)

    ws.addEventListener('message', (event: MessageEvent) => {
      this.onMessage(peerId, event.data as string)
    })
    ws.addEventListener('close', () => {
      this.onClose(peerId)
    })
  }

  onMessage(peerId: string, data: string): void {
    if (this.isRateLimited(peerId)) return

    let message: Record<string, unknown>
    try {
      message = JSON.parse(data)
    } catch {
      return
    }

    const type = message.type
    if (typeof type !== 'string' || !RELAY_MESSAGE_TYPES.has(type)) return

    if (typeof message.to === 'string') {
      this.sendTo(message.to, { ...message, from: peerId })
      return
    }

    if (type === 'room-locked') {
      this.broadcast({ ...message, from: peerId }, peerId)
    }
  }

  onClose(peerId: string): void {
    this.peers.delete(peerId)
    this.rateLimits.delete(peerId)
    this.broadcast({ type: 'peer-left', peerId })

    if (this.peers.size === 0) {
      void this.state.storage.delete('created')
    }
  }

  private isRateLimited(peerId: string): boolean {
    const now = Date.now()
    const timestamps = (this.rateLimits.get(peerId) ?? []).filter(
      (t) => now - t < RATE_LIMIT_WINDOW_MS,
    )

    if (timestamps.length >= RATE_LIMIT_MAX_MESSAGES) {
      this.rateLimits.set(peerId, timestamps)
      return true
    }

    timestamps.push(now)
    this.rateLimits.set(peerId, timestamps)
    return false
  }

  private sendTo(peerId: string, message: unknown): void {
    const ws = this.peers.get(peerId)
    if (ws) ws.send(JSON.stringify(message))
  }

  private broadcast(message: unknown, excludePeerId?: string): void {
    for (const [id, ws] of this.peers) {
      if (id === excludePeerId) continue
      ws.send(JSON.stringify(message))
    }
  }
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const url = new URL(request.url)

  if (request.method === 'POST' && url.pathname === '/room') {
    const code = generateRoomCode()
    const id = env.WISP_ROOM.idFromName(code)
    const stub = env.WISP_ROOM.get(id)
    await stub.fetch('https://internal/create', { method: 'POST' })
    return new Response(JSON.stringify({ code }), {
      headers: { 'content-type': 'application/json', ...CORS_HEADERS },
    })
  }

  const wsMatch = url.pathname.match(/^\/room\/([^/]+)\/ws$/)
  if (request.method === 'GET' && wsMatch) {
    const code = wsMatch[1]
    if (!code) {
      return new Response('Missing room code', { status: 400, headers: CORS_HEADERS })
    }
    const id = env.WISP_ROOM.idFromName(code)
    const stub = env.WISP_ROOM.get(id)
    return stub.fetch(request)
  }

  return new Response('Not found', { status: 404, headers: CORS_HEADERS })
}

export default {
  fetch: handleRequest,
}

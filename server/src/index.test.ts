import { describe, expect, it } from 'vitest'
import worker, { generateRoomCode, WispRoom, type Env } from './index'

class MockWebSocket {
  public sent: string[] = []
  public closed = false
  private listeners: Record<string, Array<(event: { data?: string }) => void>> = {}

  accept(): void {}

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.closed = true
  }

  addEventListener(type: string, listener: (event: { data?: string }) => void): void {
    const list = this.listeners[type] ?? []
    list.push(listener)
    this.listeners[type] = list
  }

  dispatch(type: string, event: { data?: string } = {}): void {
    for (const listener of this.listeners[type] ?? []) listener(event)
  }
}

function createMockEnv(): Env {
  return {
    WISP_ROOM: {
      idFromName: (name: string) => name,
      get: () => ({ fetch: async () => new Response(null) }),
    },
  } as unknown as Env
}

function createRoom(): WispRoom {
  return new WispRoom({} as never, createMockEnv())
}

describe('generateRoomCode', () => {
  it('returns 6 uppercase alphanumeric characters', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode()
      expect(code).toMatch(/^[A-Z0-9]{6}$/)
    }
  })
})

describe('POST /room', () => {
  it('returns { code } with a 6-char string', async () => {
    const request = new Request('http://localhost/room', { method: 'POST' })
    const response = await worker.fetch(request, createMockEnv())
    expect(response.status).toBe(200)
    const body = (await response.json()) as { code: string }
    expect(body.code).toMatch(/^[A-Z0-9]{6}$/)
  })
})

describe('WispRoom message relay', () => {
  it('forwards a message with a `to` field only to the target peer', () => {
    const room = createRoom()
    const wsA = new MockWebSocket()
    const wsB = new MockWebSocket()
    const wsC = new MockWebSocket()

    room.handleSession(wsA as unknown as WebSocket)
    room.handleSession(wsB as unknown as WebSocket)
    room.handleSession(wsC as unknown as WebSocket)

    const peerIds = Array.from((room as unknown as { peers: Map<string, unknown> }).peers.keys())
    const [peerAId, peerBId] = peerIds

    wsA.sent = []
    wsB.sent = []
    wsC.sent = []

    wsA.dispatch('message', {
      data: JSON.stringify({ type: 'offer', to: peerBId, sdp: { fake: true } }),
    })

    expect(wsB.sent.length).toBe(1)
    const forwarded = JSON.parse(wsB.sent[0] as string)
    expect(forwarded.type).toBe('offer')
    expect(forwarded.from).toBe(peerAId)

    expect(wsA.sent.length).toBe(0)
    expect(wsC.sent.length).toBe(0)
  })
})

describe('CORS', () => {
  it('returns Access-Control-Allow-Origin on POST /room so a cross-origin webview can read the response', async () => {
    const request = new Request('http://localhost/room', { method: 'POST' })
    const response = await worker.fetch(request, createMockEnv())
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('responds to an OPTIONS preflight request with 204 and CORS headers', async () => {
    const request = new Request('http://localhost/room', { method: 'OPTIONS' })
    const response = await worker.fetch(request, createMockEnv())
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('returns CORS headers on a 404 response too', async () => {
    const request = new Request('http://localhost/unknown', { method: 'GET' })
    const response = await worker.fetch(request, createMockEnv())
    expect(response.status).toBe(404)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})

describe('WispRoom max peers', () => {
  it('rejects the 5th peer connection with room-full', () => {
    const room = createRoom()
    const sockets = [
      new MockWebSocket(),
      new MockWebSocket(),
      new MockWebSocket(),
      new MockWebSocket(),
      new MockWebSocket(),
    ]

    for (const ws of sockets) {
      room.handleSession(ws as unknown as WebSocket)
    }

    const fifth = sockets[4] as MockWebSocket
    expect(fifth.closed).toBe(true)
    expect(fifth.sent.length).toBe(1)
    const message = JSON.parse(fifth.sent[0] as string)
    expect(message.type).toBe('room-full')

    const peers = (room as unknown as { peers: Map<string, unknown> }).peers
    expect(peers.size).toBe(4)
  })
})

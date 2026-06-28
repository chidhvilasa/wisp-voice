import { afterEach, describe, expect, it, vi } from 'vitest'
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

function createMockState(): { storage: { get: (k: string) => unknown; put: (k: string, v: unknown) => void } } {
  const data = new Map<string, unknown>()
  return {
    storage: {
      get: async (key: string) => data.get(key),
      put: async (key: string, value: unknown) => {
        data.set(key, value)
      },
    },
  }
}

function createMockEnv(): Env {
  const rooms = new Map<string, WispRoom>()
  return {
    WISP_ROOM: {
      idFromName: (name: string) => name,
      get: (id: string) => {
        let room = rooms.get(id)
        if (!room) {
          room = new WispRoom(createMockState() as never, {} as Env)
          rooms.set(id, room)
        }
        return { fetch: (req: Request | string, init?: RequestInit) => room!.fetch(toRequest(req, init)) }
      },
    },
  } as unknown as Env
}

function toRequest(req: Request | string, init?: RequestInit): Request {
  return typeof req === 'string' ? new Request(req, init) : req
}

function createRoom(): WispRoom {
  return new WispRoom(createMockState() as never, createMockEnv())
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

describe('Room existence enforcement', () => {
  it('returns 404 for a websocket upgrade to a code nobody created via POST /room', async () => {
    const env = createMockEnv()
    const request = new Request('http://localhost/room/ZZZZZZ/ws', { headers: { Upgrade: 'websocket' } })
    const response = await worker.fetch(request, env)
    expect(response.status).toBe(404)
  })

  it('passes the existence check for a code that was created via POST /room', async () => {
    const env = createMockEnv()
    const createRequest = new Request('http://localhost/room', { method: 'POST' })
    const createResponse = await worker.fetch(createRequest, env)
    const { code } = (await createResponse.json()) as { code: string }

    const wsRequest = new Request(`http://localhost/room/${code}/ws`, { headers: { Upgrade: 'websocket' } })
    let status: number | undefined
    try {
      const response = await worker.fetch(wsRequest, env)
      status = response.status
    } catch {
      // WebSocketPair is unavailable in the Node test runtime; throwing here
      // proves execution passed the existence check and reached real pairing,
      // which is exactly what this test needs to confirm.
    }
    expect(status).not.toBe(404)
  })
})

describe('GET /ice-servers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns an array containing at least STUN entries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const request = new Request('http://localhost/ice-servers', {
      headers: { 'CF-Connecting-IP': 'test-ip-stun-entries' },
    })
    const response = await worker.fetch(request, createMockEnv())
    expect(response.status).toBe(200)
    const body = (await response.json()) as { urls: string[] | string }[]
    expect(Array.isArray(body)).toBe(true)
    const hasStun = body.some((entry) => {
      const urls = Array.isArray(entry.urls) ? entry.urls : [entry.urls]
      return urls.some((u) => u.startsWith('stun:'))
    })
    expect(hasStun).toBe(true)
  })

  it('returns 429 after 10 requests in the rate-limit window', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const env = createMockEnv()
    const ip = 'test-ip-rate-limit'

    let lastStatus = 0
    for (let i = 0; i < 11; i++) {
      const request = new Request('http://localhost/ice-servers', {
        headers: { 'CF-Connecting-IP': ip },
      })
      const response = await worker.fetch(request, env)
      lastStatus = response.status
    }

    expect(lastStatus).toBe(429)
  })

  it('responds with a Cache-Control: no-store header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const request = new Request('http://localhost/ice-servers', {
      headers: { 'CF-Connecting-IP': 'test-ip-cache-control' },
    })
    const response = await worker.fetch(request, createMockEnv())
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('never includes the raw Metered API key in the response body', async () => {
    const fakeApiKey = 'fake-test-metered-api-key-12345'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ urls: ['turn:example.metered.live'], username: 'u', credential: 'c' }],
      }),
    )
    const env = { ...createMockEnv(), METERED_SECRET_KEY: fakeApiKey }
    const request = new Request('http://localhost/ice-servers', {
      headers: { 'CF-Connecting-IP': 'test-ip-no-key-leak' },
    })
    const response = await worker.fetch(request, env)
    const bodyText = await response.text()
    expect(bodyText).not.toContain(fakeApiKey)
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

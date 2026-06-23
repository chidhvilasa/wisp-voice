import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WispVoiceEngine } from './webrtc'

// ---------------------------------------------------------------------------
// Mock MediaStream / getUserMedia
// ---------------------------------------------------------------------------

class MockMediaStreamTrack {
  kind = 'audio'
  enabled = true
  stop = vi.fn()
}

class MockMediaStream {
  private tracks: MockMediaStreamTrack[]

  constructor(tracks: MockMediaStreamTrack[]) {
    this.tracks = tracks
  }

  getTracks(): MockMediaStreamTrack[] {
    return this.tracks
  }

  getAudioTracks(): MockMediaStreamTrack[] {
    return this.tracks.filter((t) => t.kind === 'audio')
  }
}

function installGetUserMedia(): { lastStream: () => MockMediaStream | null } {
  let lastStream: MockMediaStream | null = null
  const getUserMedia = vi.fn(async () => {
    const track = new MockMediaStreamTrack()
    lastStream = new MockMediaStream([track])
    return lastStream as unknown as MediaStream
  })
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  return { lastStream: () => lastStream }
}

// ---------------------------------------------------------------------------
// Mock AudioContext
// ---------------------------------------------------------------------------

class MockGainNode {
  gain = {
    value: 1,
    linearRampToValueAtTime: vi.fn((value: number) => value),
  }
  connect = vi.fn()
  disconnect = vi.fn()
}

class MockAnalyserNode {
  fftSize = 1024
  connect = vi.fn()
  disconnect = vi.fn()
  getFloatTimeDomainData(buffer: Float32Array): void {
    buffer.fill(0)
  }
}

class MockAudioContext {
  destination = {}
  currentTime = 0
  createGain(): MockGainNode {
    return new MockGainNode()
  }
  createAnalyser(): MockAnalyserNode {
    return new MockAnalyserNode()
  }
  createMediaStreamSource(_stream: unknown): { connect: () => void; disconnect: () => void } {
    return { connect: vi.fn(), disconnect: vi.fn() }
  }
  createMediaStreamDestination(): { stream: MockMediaStream; connect: () => void; disconnect: () => void } {
    return {
      stream: new MockMediaStream([new MockMediaStreamTrack()]),
      connect: vi.fn(),
      disconnect: vi.fn(),
    }
  }
  async close(): Promise<void> {}
}

// ---------------------------------------------------------------------------
// Mock RTCPeerConnection — links two mock peer connections together by
// embedding the instance id in the fake SDP, simulating a real handshake.
// ---------------------------------------------------------------------------

class MockRTCDataChannel {
  readyState: 'connecting' | 'open' | 'closed' = 'connecting'
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  private linked: MockRTCDataChannel | null = null

  constructor(public label: string) {}

  link(other: MockRTCDataChannel): void {
    this.linked = other
    this.readyState = 'open'
    queueMicrotask(() => this.onopen?.())
  }

  send(data: string): void {
    queueMicrotask(() => this.linked?.onmessage?.({ data }))
  }

  close(): void {
    this.readyState = 'closed'
    this.onclose?.()
  }
}

class MockRTCPeerConnection {
  static instances: MockRTCPeerConnection[] = []

  id = generateId()
  connectionState: string = 'new'
  localDescription: { type: string; sdp: string } | null = null
  remoteDescription: { type: string; sdp: string } | null = null
  onicecandidate: ((event: { candidate: unknown }) => void) | null = null
  onconnectionstatechange: (() => void) | null = null
  ontrack: ((event: { streams: MockMediaStream[] }) => void) | null = null
  ondatachannel: ((event: { channel: MockRTCDataChannel }) => void) | null = null

  private ownChannels: MockRTCDataChannel[] = []
  private ownTracks: MockMediaStreamTrack[] = []
  private peer: MockRTCPeerConnection | null = null
  private linked = false

  constructor(_config?: unknown) {
    MockRTCPeerConnection.instances.push(this)
  }

  createDataChannel(label: string): MockRTCDataChannel {
    const channel = new MockRTCDataChannel(label)
    this.ownChannels.push(channel)
    return channel
  }

  addTrack(track: unknown, _stream: unknown): { track: unknown } {
    this.ownTracks.push(track as MockMediaStreamTrack)
    return { track }
  }

  async createOffer(): Promise<{ type: string; sdp: string }> {
    return { type: 'offer', sdp: `offer-from-${this.id}` }
  }

  async createAnswer(): Promise<{ type: string; sdp: string }> {
    return { type: 'answer', sdp: `answer-from-${this.id}` }
  }

  async setLocalDescription(desc: { type: string; sdp: string }): Promise<void> {
    this.localDescription = desc
    queueMicrotask(() => {
      this.onicecandidate?.({ candidate: { candidate: `cand-${this.id}`, sdpMid: '0' } })
      this.onicecandidate?.({ candidate: null })
    })
    this.tryLink()
  }

  async setRemoteDescription(desc: { type: string; sdp: string }): Promise<void> {
    this.remoteDescription = desc
    const remoteId = desc.sdp.replace(/^(offer|answer)-from-/, '')
    const partner = MockRTCPeerConnection.instances.find((pc) => pc.id === remoteId)
    if (partner) {
      this.peer = partner
      partner.peer = this
    }
    this.tryLink()
    partner?.tryLink()
  }

  async addIceCandidate(_candidate: unknown): Promise<void> {}

  async getStats(): Promise<Map<string, Record<string, unknown>>> {
    const stats = new Map<string, Record<string, unknown>>()
    stats.set('candidate-pair-1', {
      type: 'candidate-pair',
      state: 'succeeded',
      currentRoundTripTime: 0.05,
    })
    stats.set('outbound-rtp-1', { type: 'outbound-rtp', bytesSent: 1000 })
    stats.set('inbound-rtp-1', { type: 'inbound-rtp', bytesReceived: 2000 })
    return stats as unknown as Map<string, Record<string, unknown>>
  }

  close(): void {
    this.connectionState = 'closed'
    this.onconnectionstatechange?.()
  }

  private tryLink(): void {
    if (this.linked) return
    if (this.peer && this.localDescription && this.remoteDescription) {
      this.linked = true
      this.connectionState = 'connected'
      this.onconnectionstatechange?.()
      for (const channel of this.ownChannels) {
        this.peer.receiveDataChannel(channel)
      }
      if (this.ownTracks.length > 0) {
        this.peer.receiveTracks(this.ownTracks)
      }
    }
  }

  private receiveTracks(tracks: MockMediaStreamTrack[]): void {
    const stream = new MockMediaStream(tracks)
    this.ontrack?.({ streams: [stream] })
  }

  private receiveDataChannel(remoteChannel: MockRTCDataChannel): void {
    const localChannel = new MockRTCDataChannel(remoteChannel.label)
    remoteChannel.link(localChannel)
    localChannel.link(remoteChannel)
    this.ondatachannel?.({ channel: localChannel })
  }
}

function generateId(): string {
  return Math.random().toString(36).slice(2)
}

function installRTCPeerConnection(): void {
  MockRTCPeerConnection.instances = []
  vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection)
}

// ---------------------------------------------------------------------------
// Mock signaling WebSocket — simulates the Phase 2 Cloudflare Worker relay.
// ---------------------------------------------------------------------------

class MockSignalingRoom {
  private peers: Map<string, MockWebSocket> = new Map()
  private counter = 0

  join(ws: MockWebSocket): void {
    const peerId = `PEER${++this.counter}-${generateId()}`
    ws.peerId = peerId
    const existingPeers = Array.from(this.peers.keys())
    this.peers.set(peerId, ws)
    ws.deliver({ type: 'joined', peerId, existingPeers })
    for (const [id, otherWs] of this.peers) {
      if (id === peerId) continue
      otherWs.deliver({ type: 'peer-joined', peerId })
    }
  }

  relay(from: MockWebSocket, message: Record<string, unknown>): void {
    const to = message['to'] as string | undefined
    if (to) {
      const target = this.peers.get(to)
      target?.deliver({ ...message, from: from.peerId })
    }
  }

  leave(ws: MockWebSocket): void {
    if (!ws.peerId) return
    this.peers.delete(ws.peerId)
    for (const otherWs of this.peers.values()) {
      otherWs.deliver({ type: 'peer-left', peerId: ws.peerId })
    }
  }
}

class MockWebSocket {
  static rooms: Map<string, MockSignalingRoom> = new Map()

  readyState = 0
  peerId = ''
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  private room: MockSignalingRoom

  constructor(public url: string) {
    const match = /\/room\/([^/]+)\/ws/.exec(url)
    const code = match?.[1] ?? 'DEFAULT'
    let room = MockWebSocket.rooms.get(code)
    if (!room) {
      room = new MockSignalingRoom()
      MockWebSocket.rooms.set(code, room)
    }
    this.room = room
    queueMicrotask(() => {
      this.readyState = 1
      this.onopen?.()
      this.room.join(this)
    })
  }

  deliver(message: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(message) })
  }

  send(data: string): void {
    this.room.relay(this, JSON.parse(data))
  }

  close(): void {
    this.readyState = 3
    this.room.leave(this)
    this.onclose?.()
  }
}

function installWebSocket(): void {
  MockWebSocket.rooms = new Map()
  vi.stubGlobal('WebSocket', MockWebSocket)
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function waitForConnectionState(engine: WispVoiceEngine, target: string): Promise<void> {
  return new Promise((resolve) => {
    if (engine.getConnectionState() === target) {
      resolve()
      return
    }
    engine.on('connection-state-change', (state) => {
      if (state === target) resolve()
    })
  })
}

async function connectPair(): Promise<{
  engineA: WispVoiceEngine
  engineB: WispVoiceEngine
}> {
  const engineA = new WispVoiceEngine('ws://localhost:8787')
  const engineB = new WispVoiceEngine('ws://localhost:8787')

  const connectedA = waitForConnectionState(engineA, 'connected')
  const connectedB = waitForConnectionState(engineB, 'connected')

  await engineA.connect('ABC123', 'Alice')
  await engineB.connect('ABC123', 'Bob')

  await Promise.all([connectedA, connectedB])

  return { engineA, engineB }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WispVoiceEngine', () => {
  beforeEach(() => {
    installGetUserMedia()
    installRTCPeerConnection()
    installWebSocket()
    vi.stubGlobal('AudioContext', MockAudioContext)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('two engines exchange SDP and reach connected state', async () => {
    const { engineA, engineB } = await connectPair()

    expect(engineA.getConnectionState()).toBe('connected')
    expect(engineB.getConnectionState()).toBe('connected')

    engineA.disconnect()
    engineB.disconnect()
  })

  it('setMuted disables audio tracks', async () => {
    const media = installGetUserMedia()
    const engine = new WispVoiceEngine('ws://localhost:8787')

    await engine.connect('ROOM01', 'Alice')

    const stream = media.lastStream()
    expect(stream).not.toBeNull()
    const [track] = stream!.getAudioTracks()

    expect(track!.enabled).toBe(true)
    engine.setMuted(true)
    expect(track!.enabled).toBe(false)
    engine.setMuted(false)
    expect(track!.enabled).toBe(true)

    engine.disconnect()
  })

  it('setPeerVolume clamps between 0 and 2', async () => {
    const { engineA, engineB } = await connectPair()

    const remotePeerId = Array.from(
      (engineA as unknown as { gainNodes: Map<string, { gain: { value: number } }> }).gainNodes
        .keys(),
    )[0] as string

    engineA.setPeerVolume(remotePeerId, 5)
    const gainNodes = (engineA as unknown as { gainNodes: Map<string, { gain: { value: number } }> })
      .gainNodes
    expect(gainNodes.get(remotePeerId)?.gain.value).toBe(2)

    engineA.setPeerVolume(remotePeerId, -3)
    expect(gainNodes.get(remotePeerId)?.gain.value).toBe(0)

    engineA.setPeerVolume(remotePeerId, 1.5)
    expect(gainNodes.get(remotePeerId)?.gain.value).toBe(1.5)

    engineA.disconnect()
    engineB.disconnect()
  })

  it('disconnect cleans up all connections', async () => {
    const { engineA, engineB } = await connectPair()

    const internals = engineA as unknown as {
      connections: Map<string, unknown>
      dataChannels: Map<string, unknown>
      gainNodes: Map<string, unknown>
    }
    expect(internals.connections.size).toBeGreaterThan(0)

    engineA.disconnect()

    expect(internals.connections.size).toBe(0)
    expect(internals.dataChannels.size).toBe(0)
    expect(internals.gainNodes.size).toBe(0)
    expect(engineA.getConnectionState()).toBe('idle')

    engineB.disconnect()
  })
})

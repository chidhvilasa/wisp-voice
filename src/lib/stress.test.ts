// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { WispVoiceEngine } from './webrtc'
import { AudioPipeline } from './audio'
import { VADProcessor } from './vad'
import { createReconnectScheduler, RECONNECT_DELAYS_MS, MAX_RECONNECT_ATTEMPTS } from './reconnect'
import { joinRoom, createRoom, destroyVoiceEngine } from './rooms'
import { useSettingsStore } from '../store/settingsStore'
import Overlay from '../overlay/Overlay'
import type { Peer } from '../types'

// ---------------------------------------------------------------------------
// Mock @tauri-apps/api/event — captures registered listeners for Scenario 12.
// ---------------------------------------------------------------------------

const { listenHandlers } = vi.hoisted(() => ({
  listenHandlers: {} as Record<string, (event: { payload: unknown }) => void>,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((event: string, handler: (e: { payload: unknown }) => void) => {
    listenHandlers[event] = handler
    return Promise.resolve(() => {
      delete listenHandlers[event]
    })
  }),
}))

// ---------------------------------------------------------------------------
// Shared media / WebRTC / signaling mocks (duplicated + extended from
// webrtc.test.ts so the server's capacity + rate-limit rules can be modeled).
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
// Mock signaling WebSocket — mirrors server/src/index.ts's WispRoom, including
// the MAX_PEERS_PER_ROOM capacity gate and the per-peer sliding-window rate
// limiter, neither of which webrtc.test.ts's version needed to model.
// ---------------------------------------------------------------------------

const MAX_PEERS_PER_ROOM = 4
const RATE_LIMIT_WINDOW_MS = 1000
const RATE_LIMIT_MAX_MESSAGES = 10

class MockSignalingRoom {
  private peers: Map<string, MockWebSocket> = new Map()
  private counter = 0
  private messageTimestamps: Map<string, number[]> = new Map()

  join(ws: MockWebSocket): void {
    if (this.peers.size >= MAX_PEERS_PER_ROOM) {
      ws.deliver({ type: 'room-full' })
      ws.close()
      return
    }

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
    if (this.isRateLimited(from.peerId)) return
    const to = message['to'] as string | undefined
    if (to) {
      const target = this.peers.get(to)
      target?.deliver({ ...message, from: from.peerId })
    }
  }

  private isRateLimited(peerId: string): boolean {
    const now = Date.now()
    const timestamps = (this.messageTimestamps.get(peerId) ?? []).filter(
      (t) => now - t < RATE_LIMIT_WINDOW_MS,
    )
    if (timestamps.length >= RATE_LIMIT_MAX_MESSAGES) {
      this.messageTimestamps.set(peerId, timestamps)
      return true
    }
    timestamps.push(now)
    this.messageTimestamps.set(peerId, timestamps)
    return false
  }

  leave(ws: MockWebSocket): void {
    if (!ws.peerId) return
    this.peers.delete(ws.peerId)
    this.messageTimestamps.delete(ws.peerId)
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
// Engine test helpers
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

async function connectPair(roomCode = 'ABC123'): Promise<{
  engineA: WispVoiceEngine
  engineB: WispVoiceEngine
}> {
  const engineA = new WispVoiceEngine('ws://localhost:8787')
  const engineB = new WispVoiceEngine('ws://localhost:8787')

  const connectedA = waitForConnectionState(engineA, 'connected')
  const connectedB = waitForConnectionState(engineB, 'connected')

  await engineA.connect(roomCode, 'Alice')
  await engineB.connect(roomCode, 'Bob')

  await Promise.all([connectedA, connectedB])

  return { engineA, engineB }
}

async function connectMesh(roomCode: string, names: string[]): Promise<WispVoiceEngine[]> {
  const engines = names.map(() => new WispVoiceEngine('ws://localhost:8787'))
  const connectedPromises = engines.map((engine) => waitForConnectionState(engine, 'connected'))

  for (let i = 0; i < engines.length; i++) {
    await engines[i].connect(roomCode, names[i] as string)
  }

  await Promise.all(connectedPromises)
  return engines
}

function installEngineMocks(): void {
  installGetUserMedia()
  installRTCPeerConnection()
  installWebSocket()
  vi.stubGlobal('AudioContext', MockAudioContext)
}

// ---------------------------------------------------------------------------
// Stress tests
// ---------------------------------------------------------------------------

describe('WISP stress tests', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('Scenario 1: room capacity rejects the 5th peer while the first 4 connect', async () => {
    installEngineMocks()

    const names = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve']
    const engines = names.map(() => new WispVoiceEngine('ws://localhost:8787'))

    const results = await Promise.allSettled(
      engines.map((engine, i) => engine.connect('CAP001', names[i] as string)),
    )

    const fulfilledEngines = engines.filter((_, i) => results[i]?.status === 'fulfilled')
    const rejectedEngines = engines.filter((_, i) => results[i]?.status === 'rejected')

    expect(fulfilledEngines.length).toBe(4)
    expect(rejectedEngines.length).toBe(1)

    await Promise.all(fulfilledEngines.map((engine) => waitForConnectionState(engine, 'connected')))

    for (const engine of fulfilledEngines) {
      expect(engine.getConnectionState()).toBe('connected')
    }
    expect(rejectedEngines[0]?.getConnectionState()).toBe('idle')

    for (const engine of engines) engine.disconnect()
  })

  it('Scenario 2: rapid mute/unmute 100x ends unmuted with no errors, still connected', async () => {
    installEngineMocks()
    const { engineA, engineB } = await connectPair('MUTE001')

    const errorSpy = vi.fn()
    engineA.on('error', errorSpy)

    for (let i = 0; i < 100; i++) {
      engineA.setMuted(i % 2 === 0)
    }
    engineA.setMuted(false)

    expect(errorSpy).not.toHaveBeenCalled()
    expect(engineA.getConnectionState()).toBe('connected')

    const internals = engineA as unknown as { localStream: MockMediaStream | null }
    const track = internals.localStream?.getAudioTracks()[0]
    expect(track?.enabled).toBe(true)

    engineA.disconnect()
    engineB.disconnect()
  })

  it('Scenario 3: abrupt mid-session peer disconnect cleans up with no leaks', async () => {
    installEngineMocks()
    const engines = await connectMesh('MESH001', ['Alice', 'Bob', 'Carol'])
    const [engineA, engineB, engineC] = engines as [WispVoiceEngine, WispVoiceEngine, WispVoiceEngine]

    const wsB = (engineB as unknown as { ws: MockWebSocket }).ws

    const peerLeftA = new Promise<string>((resolve) => engineA.on('peer-left', resolve))
    const peerLeftC = new Promise<string>((resolve) => engineC.on('peer-left', resolve))

    wsB.close()

    const [leftIdA, leftIdC] = await Promise.all([peerLeftA, peerLeftC])
    expect(leftIdA).toBe(wsB.peerId)
    expect(leftIdC).toBe(wsB.peerId)

    const connectionsA = (engineA as unknown as { connections: Map<string, MockRTCPeerConnection> })
      .connections
    const connectionsC = (engineC as unknown as { connections: Map<string, MockRTCPeerConnection> })
      .connections

    expect(connectionsA.has(wsB.peerId)).toBe(false)
    expect(connectionsC.has(wsB.peerId)).toBe(false)
    expect(connectionsA.size).toBe(1)
    expect(connectionsC.size).toBe(1)

    expect(engineA.getConnectionState()).toBe('connected')
    expect(engineC.getConnectionState()).toBe('connected')

    const closedPc = MockRTCPeerConnection.instances.find((pc) => pc.connectionState === 'closed')
    expect(closedPc).toBeDefined()

    engineA.disconnect()
    engineB.disconnect()
    engineC.disconnect()
  })

  it('Scenario 4: reconnect backoff follows 1s,2s,4s,8s,30s and caps at 5 attempts', async () => {
    vi.useFakeTimers()

    const attempt = vi.fn(async () => {
      throw new Error('still offline')
    })
    const onExhausted = vi.fn()
    const scheduler = createReconnectScheduler(attempt, onExhausted)

    scheduler.scheduleReconnect()

    for (const delay of RECONNECT_DELAYS_MS) {
      await vi.advanceTimersByTimeAsync(delay)
    }

    expect(attempt).toHaveBeenCalledTimes(MAX_RECONNECT_ATTEMPTS)
    expect(onExhausted).toHaveBeenCalledTimes(1)
    expect(scheduler.attempts()).toBe(MAX_RECONNECT_ATTEMPTS)

    scheduler.cancel()
  })

  it('Scenario 5: setPeerVolume clamps to 0-2.0 and maps NaN/Infinity to 1.0', () => {
    const engine = new WispVoiceEngine('ws://localhost:8787')
    const gainNode = new MockGainNode()
    const internals = engine as unknown as { gainNodes: Map<string, MockGainNode> }
    internals.gainNodes.set('peerX', gainNode)

    const cases: Array<[number, number]> = [
      [-1, 0],
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 2],
      [99, 2],
      [Number.NaN, 1.0],
      [Number.POSITIVE_INFINITY, 1.0],
      [Number.NEGATIVE_INFINITY, 1.0],
    ]

    for (const [input, expected] of cases) {
      engine.setPeerVolume('peerX', input)
      expect(gainNode.gain.value).toBe(expected)
      expect(gainNode.gain.value).toBeGreaterThanOrEqual(0)
      expect(gainNode.gain.value).toBeLessThanOrEqual(2)
    }
  })

  it('Scenario 6: VAD hysteresis suppresses rapid flapping with no timer leak', () => {
    vi.useFakeTimers()

    class ToggleAnalyserNode {
      fftSize = 1024
      loud = false
      connect = vi.fn()
      disconnect = vi.fn()
      getFloatTimeDomainData(buffer: Float32Array): void {
        buffer.fill(this.loud ? 0.9 : 0)
      }
    }

    const analyser = new ToggleAnalyserNode()

    class VadAudioContext {
      createAnalyser() {
        return analyser
      }
      createMediaStreamSource(_stream: unknown) {
        return { connect: vi.fn(), disconnect: vi.fn() }
      }
      async close(): Promise<void> {}
    }

    vi.stubGlobal('AudioContext', VadAudioContext)

    const vad = new VADProcessor()
    const stream = new MockMediaStream([new MockMediaStreamTrack()]) as unknown as MediaStream
    vad.init(stream)

    const speakingSpy = vi.fn()
    vad.on('speaking', speakingSpy)

    for (let i = 0; i < 50; i++) {
      analyser.loud = i % 2 === 0
      vi.advanceTimersByTime(10)
    }

    expect(speakingSpy.mock.calls.length).toBeLessThanOrEqual(3)

    vad.destroy()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('Scenario 7: signaling flood beyond the rate limit is dropped without reordering', async () => {
    installWebSocket()

    const wsA = new MockWebSocket('ws://localhost:8787/room/FLOOD01/ws')
    const wsB = new MockWebSocket('ws://localhost:8787/room/FLOOD01/ws')

    await Promise.resolve()
    await Promise.resolve()

    const received: number[] = []
    wsB.onmessage = (event) => {
      const message = JSON.parse(event.data) as { seq: number }
      received.push(message.seq)
    }

    for (let i = 0; i < 100; i++) {
      wsA.send(JSON.stringify({ to: wsB.peerId, seq: i }))
    }

    expect(received.length).toBe(10)
    expect(received).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('Scenario 8: room code validation only accepts 6 alphanumeric characters', async () => {
    installEngineMocks()

    const invalidCodes = ['', '12345', '1234567', 'ABC!23']
    for (const code of invalidCodes) {
      await expect(joinRoom(code)).rejects.toThrow(
        'Room code must be exactly 6 alphanumeric characters.',
      )
    }

    const validCodes = ['abc123', 'ABC123']
    for (const code of validCodes) {
      await joinRoom(code)
      destroyVoiceEngine()
    }
  })

  it('Scenario 9: settings persist across a simulated reload via rehydrate()', async () => {
    const store = useSettingsStore.getState()

    store.setInputDevice('mic-1')
    store.setOutputDevice('speaker-1')
    store.setMicVolume(1.7)
    store.setOutputVolume(0.3)
    store.setNoiseSuppression(false)
    store.setEchoCancellation(false)
    store.setAudioDucking(false)
    store.setDuckAmount(0.9)
    store.setVadThreshold(-30)
    store.setOverlayPosition({ x: 123, y: 456 })
    store.setOverlayMode('full')
    store.setOverlayAutoHide(false)
    store.setOverlayOpacity(0.5)
    store.setHotkeys({
      mute: 'Ctrl+1',
      deafen: 'Ctrl+2',
      overlayToggle: 'Ctrl+3',
      overlayMode: 'Ctrl+4',
      soundboard1: 'Ctrl+5',
      soundboard2: 'Ctrl+6',
      soundboard3: 'Ctrl+7',
      soundboard4: 'Ctrl+8',
      soundboard5: 'Ctrl+9',
    })
    store.setLaunchOnStartup(true)
    store.setMinimizeToTray(false)
    store.setDisplayName('StressTester')
    store.setSoundboardFile(0, '/sounds/a.mp3')
    store.setSoundboardFile(4, '/sounds/e.mp3')

    const expected = useSettingsStore.getState()

    await useSettingsStore.persist.rehydrate()

    const rehydrated = useSettingsStore.getState()
    expect(rehydrated.inputDevice).toBe(expected.inputDevice)
    expect(rehydrated.outputDevice).toBe(expected.outputDevice)
    expect(rehydrated.micVolume).toBe(expected.micVolume)
    expect(rehydrated.outputVolume).toBe(expected.outputVolume)
    expect(rehydrated.noiseSuppression).toBe(expected.noiseSuppression)
    expect(rehydrated.echoCancellation).toBe(expected.echoCancellation)
    expect(rehydrated.audioDucking).toBe(expected.audioDucking)
    expect(rehydrated.duckAmount).toBe(expected.duckAmount)
    expect(rehydrated.vadThreshold).toBe(expected.vadThreshold)
    expect(rehydrated.overlayPosition).toEqual(expected.overlayPosition)
    expect(rehydrated.overlayMode).toBe(expected.overlayMode)
    expect(rehydrated.overlayAutoHide).toBe(expected.overlayAutoHide)
    expect(rehydrated.overlayOpacity).toBe(expected.overlayOpacity)
    expect(rehydrated.hotkeys).toEqual(expected.hotkeys)
    expect(rehydrated.launchOnStartup).toBe(expected.launchOnStartup)
    expect(rehydrated.minimizeToTray).toBe(expected.minimizeToTray)
    expect(rehydrated.displayName).toBe(expected.displayName)
    expect(rehydrated.soundboardFiles).toEqual(expected.soundboardFiles)

    expect(sessionStorage.length).toBe(0)
  })

  it('Scenario 10: concurrent createRoom calls return 3 distinct codes', async () => {
    let counter = 0
    const fetchMock = vi.fn(async () => {
      counter++
      const code = `ROOM${counter}`
      return {
        ok: true,
        json: async () => ({ code }),
      } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    const codes = await Promise.all([createRoom(), createRoom(), createRoom()])

    expect(new Set(codes).size).toBe(3)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('Scenario 11: AudioPipeline.destroy() is safe to call twice', async () => {
    class MockAudioNode {
      connect = vi.fn()
      disconnect = vi.fn()
    }

    class FullMockGainNode extends MockAudioNode {
      gain = {
        value: 1,
        linearRampToValueAtTime: vi.fn((value: number) => {
          this.gain.value = value
        }),
      }
    }

    class MockAudioWorkletNode extends MockAudioNode {
      port = { postMessage: vi.fn() }
      constructor(_context: unknown, _name: string) {
        super()
      }
    }

    class FullMockAudioContext {
      currentTime = 0
      audioWorklet = { addModule: vi.fn(async () => {}) }

      createMediaStreamSource(_stream: unknown): MockAudioNode {
        return new MockAudioNode()
      }
      createGain(): FullMockGainNode {
        return new FullMockGainNode()
      }
      createMediaStreamDestination(): { stream: MockMediaStream } & MockAudioNode {
        const node = new MockAudioNode() as MockAudioNode & { stream: MockMediaStream }
        node.stream = new MockMediaStream([new MockMediaStreamTrack()])
        return node
      }
      async close(): Promise<void> {}
    }

    vi.stubGlobal('AudioContext', FullMockAudioContext)
    vi.stubGlobal('AudioWorkletNode', MockAudioWorkletNode)

    const pipeline = new AudioPipeline()
    await pipeline.init(new MockMediaStream([new MockMediaStreamTrack()]) as unknown as MediaStream)

    const internals = pipeline as unknown as {
      source: MockAudioNode
      workletNode: MockAudioNode | null
      micGainNode: MockAudioNode
      outputGainNode: MockAudioNode
      destinationNode: MockAudioNode
    }
    const nodes = [
      internals.source,
      internals.workletNode,
      internals.micGainNode,
      internals.outputGainNode,
      internals.destinationNode,
    ].filter((node): node is MockAudioNode => node !== null)

    pipeline.destroy()
    for (const node of nodes) {
      expect(node.disconnect).toHaveBeenCalledTimes(1)
    }

    expect(() => pipeline.destroy()).not.toThrow()
    for (const node of nodes) {
      expect(node.disconnect).toHaveBeenCalledTimes(1)
    }
  })

  it('Scenario 12: Overlay reflects only the final state under a rapid event flood', async () => {
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => {
      root.render(createElement(Overlay))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(listenHandlers['peers-updated']).toBeDefined()

    function makePeer(name: string): Peer {
      return {
        id: 'flood-peer',
        name,
        muted: false,
        deafened: false,
        speaking: false,
        quality: 'good',
        latencyMs: 0,
      }
    }

    await act(async () => {
      for (let i = 0; i < 49; i++) {
        listenHandlers['peers-updated']?.({ payload: [makePeer('Other Peer')] })
      }
      listenHandlers['peers-updated']?.({ payload: [makePeer('Target Peer')] })
    })

    expect(container.textContent).toContain('TP')
    expect(container.textContent).not.toContain('OP')
    expect(container.querySelectorAll('div[class*="rounded-full"]').length).toBe(2)
    expect(errorSpy).not.toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
    document.body.removeChild(container)
    expect(listenHandlers['peers-updated']).toBeUndefined()

    errorSpy.mockRestore()
  })
})

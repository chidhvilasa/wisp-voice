import { EventEmitter } from 'eventemitter3'
import type { ChatMessage, ConnectionQuality, ConnectionState, PeerStats } from '../types'
import { AudioPipeline } from './audio'
import { VADProcessor } from './vad'

export interface WispVoiceEngineEvents {
  'peer-discovered': (peerId: string, name: string) => void
  'peer-joined': (peerId: string) => void
  'peer-left': (peerId: string) => void
  'peer-name': (peerId: string, name: string) => void
  speaking: (peerId: string, isSpeaking: boolean) => void
  'connection-state-change': (state: ConnectionState) => void
  'chat-message': (message: ChatMessage) => void
  'peer-stats': (stats: Map<string, PeerStats>) => void
  'security-warning': (peerIds: string[]) => void
  error: (error: Error) => void
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.relay.metered.ca:80' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turns:openrelay.metered.ca:443',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: [
      'turn:a.relay.metered.ca:80',
      'turn:a.relay.metered.ca:80?transport=tcp',
      'turn:a.relay.metered.ca:443',
      'turn:a.relay.metered.ca:443?transport=tcp',
    ],
    username: 'e8dd65f42a7f0b8f9f0eb9e0',
    credential: 'uR6LBDRkn3JKXL9/',
  },
]
// TODO: replace these static/shared TURN credentials with the
// /turn-credentials endpoint on the signaling worker once a Metered.ca
// API key is provisioned (see server/src/index.ts). Per-session credentials
// with a short TTL are more abuse-resistant than hardcoded ones.

const MAX_REMOTE_PEERS = 3
const STATS_INTERVAL_MS = 2000
const DATA_CHANNEL_LABEL = 'wisp-chat'
const DEFAULT_DUCK_AMOUNT = 0.2
const SIGNAL_RATE_LIMIT_MAX = 10
const SIGNAL_RATE_LIMIT_WINDOW_MS = 1000
const MAX_CHAT_LENGTH = 500
const SIGNALING_URL = 'https://wisp-signaling.chidhvilasa2004.workers.dev'
const ICE_CONNECT_TIMEOUT_MS = 15000
const ICE_RESTART_DELAY_MS = 2000
const MAX_ICE_RESTART_ATTEMPTS = 2

interface SignalMessage {
  type: string
  to?: string
  from?: string
  [key: string]: unknown
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function classifyQuality(rttMs: number): ConnectionQuality {
  if (rttMs < 80) return 'good'
  if (rttMs <= 200) return 'ok'
  return 'poor'
}

function sanitizeChatText(text: string): string {
  const stripped = text.replace(/<[^>]*>/g, '')
  return stripped.length > MAX_CHAT_LENGTH ? `${stripped.slice(0, MAX_CHAT_LENGTH)}...` : stripped
}

function toWebSocketUrl(signalingUrl: string): string {
  return signalingUrl.replace('https://', 'wss://').replace('http://', 'ws://')
}

export class WispVoiceEngine extends EventEmitter<WispVoiceEngineEvents> {
  private signalingUrl: string
  private ws: WebSocket | null = null
  private localStream: MediaStream | null = null
  private outgoingStream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private audioPipeline: AudioPipeline = new AudioPipeline()
  private vadProcessors: Map<string, VADProcessor> = new Map()
  private speakingPeers: Set<string> = new Set()
  private duckAmount = DEFAULT_DUCK_AMOUNT
  private selfId: string | null = null
  private displayName = ''
  private roomCode = ''
  private connections: Map<string, RTCPeerConnection> = new Map()
  private dataChannels: Map<string, RTCDataChannel> = new Map()
  private iceCandidateQueues: Map<string, RTCIceCandidateInit[]> = new Map()
  private iceTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private iceRestartTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private iceRestartAttempts: Map<string, number> = new Map()
  private offererPeers: Set<string> = new Set()
  private gainNodes: Map<string, GainNode> = new Map()
  private peerVolumes: Map<string, number> = new Map()
  private statsIntervalId: ReturnType<typeof setInterval> | null = null
  private muted = false
  private deafened = false
  private previousMutedState = false
  private sendTimestamps: number[] = []
  private echoCancellationEnabled = true
  private connectionState: ConnectionState = 'idle'
  private pendingConnectResolve: (() => void) | null = null
  private pendingConnectReject: ((error: Error) => void) | null = null

  constructor(signalingUrl: string = SIGNALING_URL) {
    super()
    this.signalingUrl = signalingUrl
  }

  async connect(roomCode: string, displayName: string): Promise<void> {
    if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
      throw new Error('Already connected or connecting. Call disconnect() first.')
    }

    this.roomCode = roomCode
    this.displayName = displayName
    this.setConnectionState('connecting')

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.setConnectionState('error')
      const error = new Error(
        'Microphone access unavailable. If you are on macOS, please grant microphone permission in System Settings → Privacy & Security → Microphone.',
      )
      this.emit('error', error)
      throw error
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: this.echoCancellationEnabled,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
        video: false,
      })
    } catch (error) {
      this.setConnectionState('error')
      throw error instanceof Error ? error : new Error('Failed to access microphone')
    }

    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = !this.muted
    }

    try {
      this.outgoingStream = await this.audioPipeline.init(this.localStream)
    } catch (error) {
      console.warn('Audio pipeline initialization failed, using raw microphone stream', error)
      this.outgoingStream = this.localStream
    }

    return new Promise((resolve, reject) => {
      this.pendingConnectResolve = resolve
      this.pendingConnectReject = reject

      const url = `${toWebSocketUrl(this.signalingUrl)}/room/${roomCode}/ws?name=${encodeURIComponent(displayName)}`
      const ws = new WebSocket(url)
      this.ws = ws

      ws.onmessage = (event: MessageEvent) => {
        this.handleSignalMessage(event.data as string)
      }
      ws.onerror = () => {
        const error = new Error('Unable to join the room. It may not exist, or the server may be unreachable.')
        this.emit('error', error)
        if (this.pendingConnectReject) {
          this.pendingConnectReject(error)
          this.pendingConnectResolve = null
          this.pendingConnectReject = null
        }
      }
      ws.onclose = () => {
        if (this.pendingConnectReject) {
          const error = new Error(
            'Unable to join the room. It may not exist, or the server may be unreachable.',
          )
          this.setConnectionState('error')
          this.pendingConnectReject(error)
          this.pendingConnectResolve = null
          this.pendingConnectReject = null
          return
        }
        if (this.connectionState !== 'idle') {
          this.setConnectionState('reconnecting')
        }
      }
    })
  }

  disconnect(): void {
    this.stopStatsLoop()

    for (const channel of this.dataChannels.values()) {
      channel.close()
    }
    this.dataChannels.clear()

    for (const pc of this.connections.values()) {
      this.closeConnection(pc)
    }
    this.connections.clear()
    this.gainNodes.clear()

    for (const timeoutId of this.iceTimeouts.values()) {
      clearTimeout(timeoutId)
    }
    this.iceTimeouts.clear()
    this.iceCandidateQueues.clear()

    for (const timeoutId of this.iceRestartTimeouts.values()) {
      clearTimeout(timeoutId)
    }
    this.iceRestartTimeouts.clear()
    this.iceRestartAttempts.clear()
    this.offererPeers.clear()

    for (const vad of this.vadProcessors.values()) {
      vad.destroy()
    }
    this.vadProcessors.clear()
    this.speakingPeers.clear()

    this.audioPipeline.destroy()
    this.outgoingStream = null

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop()
      }
      this.localStream = null
    }

    if (this.audioContext) {
      void this.audioContext.close()
      this.audioContext = null
    }

    if (this.ws) {
      this.ws.onmessage = null
      this.ws.onerror = null
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }

    this.selfId = null
    this.pendingConnectResolve = null
    this.pendingConnectReject = null
    this.setConnectionState('idle')
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = !muted
      }
    }
  }

  setDeafened(deafened: boolean): void {
    if (deafened === this.deafened) return
    this.deafened = deafened

    if (deafened) {
      this.previousMutedState = this.muted
      this.setMuted(true)
    } else {
      this.setMuted(this.previousMutedState)
    }

    for (const [peerId, gainNode] of this.gainNodes) {
      const volume = this.peerVolumes.get(peerId) ?? 1.0
      gainNode.gain.value = deafened ? 0 : volume
    }
  }

  setPeerVolume(peerId: string, volume: number): void {
    const safeVolume = Number.isFinite(volume) ? volume : 1.0
    const clamped = Math.min(2, Math.max(0, safeVolume))
    this.peerVolumes.set(peerId, clamped)
    const gainNode = this.gainNodes.get(peerId)
    if (gainNode && !this.deafened) {
      gainNode.gain.value = clamped
    }
  }

  sendChat(content: string, fromName: string): void {
    const message: ChatMessage = {
      id: generateId(),
      from: fromName,
      content: sanitizeChatText(content),
      timestamp: Date.now(),
    }
    const payload = JSON.stringify({ type: 'chat', ...message })
    for (const channel of this.dataChannels.values()) {
      if (channel.readyState === 'open') {
        try {
          channel.send(payload)
        } catch (error) {
          console.warn('Failed to send chat message to a peer', error)
        }
      } else if (channel.readyState === 'connecting') {
        channel.addEventListener(
          'open',
          () => {
            try {
              channel.send(payload)
            } catch (error) {
              console.warn('Failed to send queued chat message to a peer', error)
            }
          },
          { once: true },
        )
      }
    }
    this.emit('chat-message', message)
  }

  async getStats(): Promise<Map<string, PeerStats>> {
    const result = new Map<string, PeerStats>()
    const insecurePeers: string[] = []

    for (const [peerId, pc] of this.connections) {
      let rttMs = 0
      let bytesSent = 0
      let bytesReceived = 0

      try {
        const reports = await pc.getStats()
        reports.forEach((report: RTCStats & Record<string, unknown>) => {
          if (
            report.type === 'candidate-pair' &&
            report['state'] === 'succeeded' &&
            typeof report['currentRoundTripTime'] === 'number'
          ) {
            rttMs = (report['currentRoundTripTime'] as number) * 1000
          }
          if (report.type === 'outbound-rtp' && typeof report['bytesSent'] === 'number') {
            bytesSent += report['bytesSent'] as number
          }
          if (report.type === 'inbound-rtp' && typeof report['bytesReceived'] === 'number') {
            bytesReceived += report['bytesReceived'] as number
          }
          if (report.type === 'transport' && typeof report['dtlsState'] === 'string') {
            const dtlsState = report['dtlsState'] as string
            if (import.meta.env.DEV) {
              console.debug(
                `wisp: peer ${peerId} dtlsState=${dtlsState} iceConnectionState=${pc.iceConnectionState}`,
              )
            }
            if (dtlsState !== 'connected') {
              insecurePeers.push(peerId)
            }
          }
        })
      } catch {
        // stats unavailable for this peer; report zeroed values
      }

      result.set(peerId, {
        peerId,
        rttMs,
        quality: classifyQuality(rttMs),
        bytesSent,
        bytesReceived,
      })
    }

    if (insecurePeers.length > 0) {
      this.emit('security-warning', insecurePeers)
    }

    return result
  }

  getConnectionState(): ConnectionState {
    return this.connectionState
  }

  getSelfId(): string | null {
    return this.selfId
  }

  getRoomCode(): string {
    return this.roomCode
  }

  getDisplayName(): string {
    return this.displayName
  }

  getDebugInfo(): { peerId: string; connectionState: string; iceConnectionState: string }[] {
    return Array.from(this.connections.entries()).map(([peerId, pc]) => ({
      peerId,
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
    }))
  }

  setDuckAmount(amount: number): void {
    this.duckAmount = amount
  }

  setNoiseSuppression(enabled: boolean): void {
    this.audioPipeline.setNoiseSuppression(enabled)
  }

  setMicVolume(volume: number): void {
    this.audioPipeline.setMicVolume(volume)
  }

  setOutputVolume(volume: number): void {
    this.audioPipeline.setOutputVolume(volume)
  }

  async setEchoCancellation(enabled: boolean): Promise<void> {
    this.echoCancellationEnabled = enabled
    this.audioPipeline.setEchoCancellation(enabled)

    if (!this.localStream) return

    let newStream: MediaStream
    try {
      newStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: enabled,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
        video: false,
      })
    } catch (error) {
      console.warn('Failed to apply echo cancellation setting', error)
      return
    }

    for (const track of this.localStream.getTracks()) {
      track.stop()
    }
    this.localStream = newStream
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = !this.muted
    }

    try {
      this.outgoingStream = await this.audioPipeline.init(this.localStream)
    } catch (error) {
      console.warn('Audio pipeline re-initialization failed, using raw microphone stream', error)
      this.outgoingStream = this.localStream
    }

    const newTrack = this.outgoingStream.getAudioTracks()[0]
    if (!newTrack) return

    for (const pc of this.connections.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'audio')
      if (sender) {
        void sender.replaceTrack(newTrack)
      }
    }
  }

  getOutgoingStream(): MediaStream | null {
    return this.outgoingStream
  }

  sendRoomLocked(): void {
    const payload = JSON.stringify({ type: 'room-locked' })
    for (const channel of this.dataChannels.values()) {
      if (channel.readyState === 'open') {
        try {
          channel.send(payload)
        } catch (error) {
          console.warn('Failed to send room-locked notice to a peer', error)
        }
      }
    }
  }

  private startStatsLoop(): void {
    if (this.statsIntervalId !== null) return
    this.statsIntervalId = setInterval(() => {
      void this.getStats().then((stats) => {
        this.emit('peer-stats', stats)
      })
    }, STATS_INTERVAL_MS)
  }

  private stopStatsLoop(): void {
    if (this.statsIntervalId !== null) {
      clearInterval(this.statsIntervalId)
      this.statsIntervalId = null
    }
  }

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state
    if (state === 'connected') {
      this.startStatsLoop()
    } else {
      this.stopStatsLoop()
    }
    this.emit('connection-state-change', state)
  }

  private emitNegotiationError(error: unknown): void {
    this.emit('error', error instanceof Error ? error : new Error('WebRTC negotiation failed'))
  }

  private send(message: SignalMessage): void {
    const now = Date.now()
    this.sendTimestamps = this.sendTimestamps.filter(
      (timestamp) => now - timestamp < SIGNAL_RATE_LIMIT_WINDOW_MS,
    )
    if (this.sendTimestamps.length >= SIGNAL_RATE_LIMIT_MAX) {
      if (import.meta.env.DEV) {
        console.warn(`wisp: signaling rate limit exceeded, dropping message of type "${message.type}"`)
      }
      return
    }
    this.sendTimestamps.push(now)
    this.ws?.send(JSON.stringify(message))
  }

  private handleSignalMessage(data: string): void {
    let message: SignalMessage
    try {
      message = JSON.parse(data)
    } catch {
      return
    }

    switch (message.type) {
      case 'joined': {
        this.selfId = message['peerId'] as string
        // existingPeers may be string[] (older signaling server deploys) or
        // { id, name }[] (current); handle both so a client/server version
        // mismatch degrades gracefully instead of crashing on bad destructuring.
        const existingPeersRaw = (message['existingPeers'] as unknown[]) ?? []
        for (const entry of existingPeersRaw) {
          const remoteId = typeof entry === 'string' ? entry : (entry as { id?: string }).id
          const name = typeof entry === 'string' ? '' : ((entry as { name?: string }).name ?? '')
          if (!remoteId) continue
          this.emit('peer-discovered', remoteId, name || remoteId.slice(0, 8))
          this.initiateOffer(remoteId).catch((error: unknown) => this.emitNegotiationError(error))
        }
        this.pendingConnectResolve?.()
        this.pendingConnectResolve = null
        this.pendingConnectReject = null
        break
      }
      case 'peer-joined': {
        const peerId = message['peerId'] as string
        const name = (message['name'] as string) || peerId.slice(0, 8)
        this.emit('peer-discovered', peerId, name)
        break
      }
      case 'peer-left': {
        const peerId = message['peerId'] as string
        this.cleanupPeer(peerId)
        this.emit('peer-left', peerId)
        break
      }
      case 'room-full': {
        const error = new Error('Room is full. Maximum 4 people per room.')
        this.emit('error', error)
        this.pendingConnectReject?.(error)
        this.pendingConnectResolve = null
        this.pendingConnectReject = null
        this.disconnect()
        break
      }
      case 'offer':
        this.handleOffer(message.from as string, message['sdp'] as RTCSessionDescriptionInit).catch(
          (error: unknown) => this.emitNegotiationError(error),
        )
        break
      case 'answer':
        this.handleAnswer(message.from as string, message['sdp'] as RTCSessionDescriptionInit).catch(
          (error: unknown) => this.emitNegotiationError(error),
        )
        break
      case 'ice-candidate':
        void this.handleIceCandidate(
          message.from as string,
          message['candidate'] as RTCIceCandidateInit,
        )
        break
      default:
        break
    }
  }

  private async initiateOffer(remoteId: string): Promise<void> {
    if (this.connections.size >= MAX_REMOTE_PEERS) {
      this.emit('error', new Error('Maximum number of peers reached'))
      return
    }

    this.offererPeers.add(remoteId)
    if (import.meta.env.DEV) console.log('[Wisp] role: initiator for', remoteId)
    const pc = this.createPeerConnection(remoteId)
    const channel = pc.createDataChannel(DATA_CHANNEL_LABEL)
    this.setupDataChannel(remoteId, channel)

    if (this.outgoingStream) {
      for (const track of this.outgoingStream.getTracks()) {
        pc.addTrack(track, this.outgoingStream)
      }
    }

    if (import.meta.env.DEV) console.log('[Wisp] Creating offer for', remoteId)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    if (import.meta.env.DEV) console.log('[Wisp] Offer sent to', remoteId)
    this.send({ type: 'offer', to: remoteId, sdp: offer })
  }

  private async handleOffer(remoteId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.connections.has(remoteId) && this.connections.size >= MAX_REMOTE_PEERS) {
      this.emit('error', new Error('Maximum number of peers reached'))
      return
    }

    if (import.meta.env.DEV) console.log('[Wisp] Received offer from', remoteId)
    const isNewConnection = !this.connections.has(remoteId)
    if (isNewConnection && import.meta.env.DEV) {
      console.log('[Wisp] role: receiver for', remoteId)
    }
    const pc = this.connections.get(remoteId) ?? this.createPeerConnection(remoteId)

    if (this.outgoingStream) {
      for (const track of this.outgoingStream.getTracks()) {
        pc.addTrack(track, this.outgoingStream)
      }
    }

    await pc.setRemoteDescription(sdp)
    if (import.meta.env.DEV) console.log('[Wisp] Remote description set for', remoteId)
    await this.flushIceCandidateQueue(remoteId, pc)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    this.send({ type: 'answer', to: remoteId, sdp: answer })
  }

  private async handleAnswer(remoteId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.connections.get(remoteId)
    if (!pc) return
    await pc.setRemoteDescription(sdp)
    if (import.meta.env.DEV) console.log('[Wisp] Remote description set for', remoteId)
    await this.flushIceCandidateQueue(remoteId, pc)
  }

  private async flushIceCandidateQueue(remoteId: string, pc: RTCPeerConnection): Promise<void> {
    const queued = this.iceCandidateQueues.get(remoteId)
    if (!queued || queued.length === 0) return
    this.iceCandidateQueues.delete(remoteId)
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate)
      } catch {
        // ignore late/invalid candidates
      }
    }
  }

  private async handleIceCandidate(
    remoteId: string,
    candidate: RTCIceCandidateInit,
  ): Promise<void> {
    const pc = this.connections.get(remoteId)
    if (!pc || !candidate) return

    if (!pc.remoteDescription) {
      const queue = this.iceCandidateQueues.get(remoteId) ?? []
      queue.push(candidate)
      this.iceCandidateQueues.set(remoteId, queue)
      return
    }

    try {
      await pc.addIceCandidate(candidate)
    } catch {
      // ignore late/invalid candidates
    }
  }

  private createPeerConnection(remoteId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 10,
    })

    pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate) {
        if (import.meta.env.DEV) {
          console.log(
            `[Wisp ICE candidate] type: ${event.candidate.type} protocol: ${event.candidate.protocol}`,
          )
        }
        this.send({ type: 'ice-candidate', to: remoteId, candidate: event.candidate })
      }
    }

    pc.oniceconnectionstatechange = () => {
      if (import.meta.env.DEV) {
        console.log(`[Wisp ICE] ${remoteId}: ${pc.iceConnectionState}`)
      }
      if (pc.iceConnectionState === 'failed') {
        console.error(`[Wisp ICE] FAILED for peer ${remoteId} - trying restart`)
        this.scheduleIceRestart(remoteId, pc)
      }
      if (pc.iceConnectionState === 'disconnected') {
        console.warn(`[Wisp ICE] Disconnected from ${remoteId}`)
      }
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        this.clearIceRestart(remoteId)
      }
    }

    pc.onicegatheringstatechange = () => {
      if (import.meta.env.DEV) {
        console.log(`[Wisp ICE gather] ${remoteId}: ${pc.iceGatheringState}`)
      }
    }

    pc.onsignalingstatechange = () => {
      if (import.meta.env.DEV) {
        console.log(`[Wisp signaling] ${remoteId}: ${pc.signalingState}`)
      }
    }

    pc.ontrack = (event: RTCTrackEvent) => {
      this.attachRemoteStream(remoteId, event.streams[0] as MediaStream)
    }

    pc.ondatachannel = (event: RTCDataChannelEvent) => {
      this.setupDataChannel(remoteId, event.channel)
    }

    const timeoutId = setTimeout(() => {
      this.iceTimeouts.delete(remoteId)
      if (pc.connectionState !== 'connected' && pc.connectionState !== 'closed') {
        this.emit(
          'error',
          new Error('Cannot establish P2P connection. Both users may be behind strict firewalls.'),
        )
        this.cleanupPeer(remoteId)
        this.emit('peer-left', remoteId)
      }
    }, ICE_CONNECT_TIMEOUT_MS)
    this.iceTimeouts.set(remoteId, timeoutId)

    pc.onconnectionstatechange = () => {
      this.handlePeerConnectionStateChange(remoteId, pc)
    }

    this.connections.set(remoteId, pc)
    return pc
  }

  private setupDataChannel(remoteId: string, channel: RTCDataChannel): void {
    this.dataChannels.set(remoteId, channel)

    const sendHello = () => {
      try {
        channel.send(JSON.stringify({ type: 'hello', name: this.displayName }))
      } catch (error) {
        console.warn('Failed to send hello to peer', error)
      }
    }
    if (channel.readyState === 'open') {
      sendHello()
    } else {
      channel.onopen = sendHello
    }

    channel.onmessage = (event: MessageEvent) => {
      this.handleDataChannelMessage(remoteId, event.data as string)
    }
  }

  private handleDataChannelMessage(remoteId: string, data: string): void {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(data)
    } catch {
      return
    }

    if (message['type'] === 'hello') {
      const name = message['name'] as string
      if (name) this.emit('peer-name', remoteId, name)
      return
    }

    if (message['type'] === 'chat') {
      const chatMessage: ChatMessage = {
        id: (message['id'] as string) ?? generateId(),
        from: message['from'] as string,
        content: sanitizeChatText((message['content'] as string) ?? ''),
        timestamp: (message['timestamp'] as number) ?? Date.now(),
      }
      this.emit('chat-message', chatMessage)
    }
  }

  private attachRemoteStream(remoteId: string, stream: MediaStream): void {
    if (!stream) return
    if (!this.audioContext) {
      this.audioContext = new AudioContext()
    }
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume?.()
    }

    const source = this.audioContext.createMediaStreamSource(stream)
    const gainNode = this.audioContext.createGain()
    const volume = this.peerVolumes.get(remoteId) ?? 1.0
    gainNode.gain.value = this.deafened ? 0 : volume

    source.connect(gainNode)
    gainNode.connect(this.audioContext.destination)
    this.gainNodes.set(remoteId, gainNode)

    const vad = new VADProcessor()
    vad.on('speaking', (isSpeaking) => this.handlePeerSpeaking(remoteId, isSpeaking))
    vad.init(stream)
    this.vadProcessors.set(remoteId, vad)
  }

  private handlePeerSpeaking(peerId: string, isSpeaking: boolean): void {
    this.emit('speaking', peerId, isSpeaking)
    if (isSpeaking) {
      this.speakingPeers.add(peerId)
    } else {
      this.speakingPeers.delete(peerId)
    }
    this.audioPipeline.setDucked(this.speakingPeers.size > 0, this.duckAmount)
  }

  private handlePeerConnectionStateChange(remoteId: string, pc: RTCPeerConnection): void {
    if (pc.connectionState === 'connected') {
      this.clearIceTimeout(remoteId)
      this.emit('peer-joined', remoteId)
      this.setConnectionState('connected')
    } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
      this.cleanupPeer(remoteId)
      this.emit('peer-left', remoteId)
    }
    // 'failed' is handled via oniceconnectionstatechange (scheduleIceRestart), which
    // gives ICE restart a chance before tearing the connection down.
  }

  private scheduleIceRestart(remoteId: string, pc: RTCPeerConnection): void {
    if (this.iceRestartTimeouts.has(remoteId)) return
    const timeoutId = setTimeout(() => {
      this.iceRestartTimeouts.delete(remoteId)
      void this.attemptIceRestart(remoteId, pc)
    }, ICE_RESTART_DELAY_MS)
    this.iceRestartTimeouts.set(remoteId, timeoutId)
  }

  private clearIceRestart(remoteId: string): void {
    const timeoutId = this.iceRestartTimeouts.get(remoteId)
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
      this.iceRestartTimeouts.delete(remoteId)
    }
    this.iceRestartAttempts.delete(remoteId)
  }

  private async attemptIceRestart(remoteId: string, pc: RTCPeerConnection): Promise<void> {
    if (pc.iceConnectionState !== 'failed') return
    if (!this.connections.has(remoteId)) return

    const giveUp = () => {
      this.emit('error', new Error('Connection failed. You may be behind a strict firewall.'))
      this.cleanupPeer(remoteId)
      this.emit('peer-left', remoteId)
    }

    if (!this.offererPeers.has(remoteId)) {
      // Only the side that originally offered restarts ICE; the other side just
      // answers the incoming restart offer via the normal handleOffer() path.
      // If no restart offer arrives and ICE never recovers, the connection will
      // eventually close and be cleaned up via the 'closed' transition above.
      return
    }

    const attempts = (this.iceRestartAttempts.get(remoteId) ?? 0) + 1
    if (attempts > MAX_ICE_RESTART_ATTEMPTS) {
      giveUp()
      return
    }
    this.iceRestartAttempts.set(remoteId, attempts)

    console.warn('[Wisp] ICE failed, attempting restart for', remoteId)
    try {
      const offer = await pc.createOffer({ iceRestart: true })
      await pc.setLocalDescription(offer)
      this.send({ type: 'offer', to: remoteId, sdp: offer })
    } catch (err) {
      console.error('[Wisp] ICE restart failed:', err)
      giveUp()
    }
  }

  private clearIceTimeout(peerId: string): void {
    const timeoutId = this.iceTimeouts.get(peerId)
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
      this.iceTimeouts.delete(peerId)
    }
  }

  private cleanupPeer(peerId: string): void {
    this.clearIceTimeout(peerId)
    this.clearIceRestart(peerId)
    this.offererPeers.delete(peerId)
    this.iceCandidateQueues.delete(peerId)

    const pc = this.connections.get(peerId)
    if (pc) {
      this.closeConnection(pc)
      this.connections.delete(peerId)
    }
    const channel = this.dataChannels.get(peerId)
    if (channel) {
      channel.close()
      this.dataChannels.delete(peerId)
    }
    this.gainNodes.delete(peerId)
    this.peerVolumes.delete(peerId)

    const vad = this.vadProcessors.get(peerId)
    if (vad) {
      vad.destroy()
      this.vadProcessors.delete(peerId)
    }
    if (this.speakingPeers.delete(peerId)) {
      this.audioPipeline.setDucked(this.speakingPeers.size > 0, this.duckAmount)
      this.emit('speaking', peerId, false)
    }

    if (this.connections.size === 0) {
      this.stopStatsLoop()
    }
  }

  private closeConnection(pc: RTCPeerConnection): void {
    pc.onconnectionstatechange = null
    pc.onicecandidate = null
    pc.ontrack = null
    pc.ondatachannel = null
    pc.close()
  }
}

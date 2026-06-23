const MIN_VOLUME = 0
const MAX_VOLUME = 2.0
const DUCK_RAMP_MS = 50
const RESTORE_RAMP_MS = 200
const WORKLET_NAME = 'rnnoise-processor'

function clampVolume(volume: number): number {
  return Math.min(MAX_VOLUME, Math.max(MIN_VOLUME, volume))
}

export class AudioPipeline {
  private audioContext: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private workletNode: AudioWorkletNode | null = null
  private micGainNode: GainNode | null = null
  private outputGainNode: GainNode | null = null
  private destinationNode: MediaStreamAudioDestinationNode | null = null
  private outputVolume = 1.0
  private ducked = false
  private echoCancellation = true

  async init(stream: MediaStream): Promise<MediaStream> {
    this.destroy()

    this.audioContext = new AudioContext()
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume?.()
    }
    this.source = this.audioContext.createMediaStreamSource(stream)
    this.micGainNode = this.audioContext.createGain()
    this.outputGainNode = this.audioContext.createGain()
    this.destinationNode = this.audioContext.createMediaStreamDestination()

    let lastNode: AudioNode = this.source

    try {
      const workletUrl = new URL('../worklets/rnnoise-processor.ts', import.meta.url)
      await this.audioContext.audioWorklet.addModule(workletUrl)
      this.workletNode = new AudioWorkletNode(this.audioContext, WORKLET_NAME)
      lastNode.connect(this.workletNode)
      lastNode = this.workletNode
    } catch (error) {
      console.warn('Failed to load RNNoise worklet, continuing without noise suppression', error)
    }

    lastNode.connect(this.micGainNode)
    this.micGainNode.connect(this.outputGainNode)
    this.outputGainNode.connect(this.destinationNode)

    return this.destinationNode.stream
  }

  setNoiseSuppression(enabled: boolean): void {
    this.workletNode?.port.postMessage({ type: 'set-noise-suppression', enabled })
  }

  setEchoCancellation(enabled: boolean): void {
    this.echoCancellation = enabled
  }

  getEchoCancellation(): boolean {
    return this.echoCancellation
  }

  setMicVolume(volume: number): void {
    if (!this.micGainNode) return
    this.micGainNode.gain.value = clampVolume(volume)
  }

  setOutputVolume(volume: number): void {
    this.outputVolume = clampVolume(volume)
    if (!this.outputGainNode || this.ducked) return
    this.outputGainNode.gain.value = this.outputVolume
  }

  setDucked(ducked: boolean, amount: number): void {
    if (!this.outputGainNode || !this.audioContext) return
    this.ducked = ducked
    const now = this.audioContext.currentTime
    const target = ducked ? Math.max(MIN_VOLUME, this.outputVolume - amount) : this.outputVolume
    const rampSeconds = (ducked ? DUCK_RAMP_MS : RESTORE_RAMP_MS) / 1000
    this.outputGainNode.gain.linearRampToValueAtTime(target, now + rampSeconds)
  }

  destroy(): void {
    this.source?.disconnect()
    this.workletNode?.disconnect()
    this.micGainNode?.disconnect()
    this.outputGainNode?.disconnect()
    this.destinationNode?.disconnect()
    if (this.audioContext) void this.audioContext.close()

    this.audioContext = null
    this.source = null
    this.workletNode = null
    this.micGainNode = null
    this.outputGainNode = null
    this.destinationNode = null
    this.outputVolume = 1.0
    this.ducked = false
  }
}

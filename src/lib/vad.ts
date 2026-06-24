import { EventEmitter } from 'eventemitter3'

export interface VADProcessorEvents {
  speaking: (isSpeaking: boolean) => void
}

const ANALYSIS_INTERVAL_MS = 100
const HYSTERESIS_MS = 200
const DEFAULT_THRESHOLD_DB = -50
const FFT_SIZE = 1024

// requestAnimationFrame is throttled/paused by the browser/webview when the
// window is hidden, unlike setInterval; fall back to setTimeout when it's
// not available (e.g. the Node test environment).
const raf: (callback: (time: number) => void) => number =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (callback) => setTimeout(() => callback(Date.now()), 16) as unknown as number

const caf: (handle: number) => void =
  typeof cancelAnimationFrame === 'function'
    ? cancelAnimationFrame
    : (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>)

export class VADProcessor extends EventEmitter<VADProcessorEvents> {
  private thresholdDb: number
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private rafId: number | null = null
  private lastAnalysisTime = 0
  private buffer: Float32Array | null = null
  private isSpeaking = false
  private aboveSince: number | null = null
  private belowSince: number | null = null

  constructor(thresholdDb: number = DEFAULT_THRESHOLD_DB) {
    super()
    this.thresholdDb = thresholdDb
  }

  setThreshold(thresholdDb: number): void {
    this.thresholdDb = thresholdDb
  }

  init(stream: MediaStream): void {
    this.destroy()

    this.audioContext = new AudioContext()
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume?.()
    }
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = FFT_SIZE
    this.buffer = new Float32Array(this.analyser.fftSize)

    this.source = this.audioContext.createMediaStreamSource(stream)
    this.source.connect(this.analyser)

    this.isSpeaking = false
    this.aboveSince = null
    this.belowSince = null
    this.lastAnalysisTime = 0

    this.rafId = raf(this.tick)
  }

  private tick = (time: number): void => {
    if (time - this.lastAnalysisTime >= ANALYSIS_INTERVAL_MS) {
      this.lastAnalysisTime = time
      this.analyze()
    }
    this.rafId = raf(this.tick)
  }

  private analyze(): void {
    if (!this.analyser || !this.buffer) return

    this.analyser.getFloatTimeDomainData(this.buffer)

    let sumSquares = 0
    for (let i = 0; i < this.buffer.length; i++) {
      const sample = this.buffer[i] ?? 0
      sumSquares += sample * sample
    }
    const rms = Math.sqrt(sumSquares / this.buffer.length)
    const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity

    const now = Date.now()
    const isAboveThreshold = db >= this.thresholdDb

    if (isAboveThreshold) {
      this.belowSince = null
      if (this.aboveSince === null) this.aboveSince = now
      if (!this.isSpeaking && now - this.aboveSince >= HYSTERESIS_MS) {
        this.isSpeaking = true
        this.emit('speaking', true)
      }
    } else {
      this.aboveSince = null
      if (this.belowSince === null) this.belowSince = now
      if (this.isSpeaking && now - this.belowSince >= HYSTERESIS_MS) {
        this.isSpeaking = false
        this.emit('speaking', false)
      }
    }
  }

  destroy(): void {
    if (this.rafId !== null) {
      caf(this.rafId)
      this.rafId = null
    }
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }
    if (this.analyser) {
      this.analyser.disconnect()
      this.analyser = null
    }
    if (this.audioContext) {
      void this.audioContext.close()
      this.audioContext = null
    }
    this.buffer = null
    this.isSpeaking = false
    this.aboveSince = null
    this.belowSince = null
  }
}

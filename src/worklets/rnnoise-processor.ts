declare const sampleRate: number
declare function registerProcessor(
  name: string,
  processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void

declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor(options?: AudioWorkletNodeOptions)
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean
}

const FRAME_SIZE = 480
const RNNOISE_SAMPLE_RATE = 48000

interface RNNoiseInstance {
  process(frame: Float32Array): Float32Array
}

type RNNoiseFactory = () => RNNoiseInstance | Promise<RNNoiseInstance>

async function loadRNNoise(): Promise<RNNoiseInstance | null> {
  const packageName = 'rnnoise-wasm'
  try {
    const mod: unknown = await import(/* @vite-ignore */ packageName)
    const candidate = (mod as { default?: unknown }).default ?? mod
    const factory = candidate as RNNoiseFactory | RNNoiseInstance
    if (typeof factory === 'function') {
      const instance = await factory()
      if (instance && typeof instance.process === 'function') return instance
    } else if (factory && typeof (factory as RNNoiseInstance).process === 'function') {
      return factory as RNNoiseInstance
    }
  } catch {
    // rnnoise-wasm unavailable; caller falls back to pass-through
  }
  return null
}

class RNNoiseProcessor extends AudioWorkletProcessor {
  private enabled = true
  private denoiser: RNNoiseInstance | null = null
  private inputBuffer: number[] = []
  private outputBuffer: number[] = []

  constructor(options?: AudioWorkletNodeOptions) {
    super(options)

    this.port.onmessage = (event: MessageEvent<{ type: string; enabled?: boolean }>) => {
      if (event.data?.type === 'set-noise-suppression') {
        this.enabled = Boolean(event.data.enabled)
      }
    }

    void loadRNNoise().then((instance) => {
      this.denoiser = instance
    })
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0]
    const output = outputs[0]?.[0]
    if (!output) return true

    if (!input || sampleRate !== RNNOISE_SAMPLE_RATE || !this.enabled || !this.denoiser) {
      if (input) output.set(input)
      return true
    }

    for (let i = 0; i < input.length; i++) {
      this.inputBuffer.push(input[i] as number)
    }

    while (this.inputBuffer.length >= FRAME_SIZE) {
      const frame = Float32Array.from(this.inputBuffer.splice(0, FRAME_SIZE))
      const denoised = this.denoiser.process(frame)
      for (let i = 0; i < denoised.length; i++) {
        this.outputBuffer.push(denoised[i] as number)
      }
    }

    for (let i = 0; i < output.length; i++) {
      output[i] = this.outputBuffer.length > 0 ? (this.outputBuffer.shift() as number) : 0
    }

    return true
  }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor)

export {}

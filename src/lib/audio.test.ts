import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioPipeline } from './audio'

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

class MockAudioNode {
  connect = vi.fn()
  disconnect = vi.fn()
}

class MockGainNode extends MockAudioNode {
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

class MockAudioContext {
  currentTime = 0
  audioWorklet = { addModule: vi.fn(async () => {}) }

  createMediaStreamSource(_stream: unknown): MockAudioNode {
    return new MockAudioNode()
  }

  createGain(): MockGainNode {
    return new MockGainNode()
  }

  createMediaStreamDestination(): { stream: MockMediaStream } & MockAudioNode {
    const node = new MockAudioNode() as MockAudioNode & { stream: MockMediaStream }
    node.stream = new MockMediaStream([new MockMediaStreamTrack()])
    return node
  }

  async close(): Promise<void> {}
}

function installAudioMocks(): void {
  vi.stubGlobal('AudioContext', MockAudioContext)
  vi.stubGlobal('AudioWorkletNode', MockAudioWorkletNode)
}

describe('AudioPipeline', () => {
  beforeEach(() => {
    installAudioMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('init() returns a MediaStream', async () => {
    const pipeline = new AudioPipeline()
    const stream = await pipeline.init(
      new MockMediaStream([new MockMediaStreamTrack()]) as unknown as MediaStream,
    )

    expect(stream).toBeDefined()
    expect((stream as unknown as MockMediaStream).getTracks().length).toBe(1)

    pipeline.destroy()
  })

  it('setMicVolume clamps values to 0-2.0', async () => {
    const pipeline = new AudioPipeline()
    await pipeline.init(new MockMediaStream([new MockMediaStreamTrack()]) as unknown as MediaStream)

    const micGainNode = (pipeline as unknown as { micGainNode: MockGainNode }).micGainNode

    pipeline.setMicVolume(5)
    expect(micGainNode.gain.value).toBe(2)

    pipeline.setMicVolume(-1)
    expect(micGainNode.gain.value).toBe(0)

    pipeline.setMicVolume(1.5)
    expect(micGainNode.gain.value).toBe(1.5)

    pipeline.destroy()
  })

  it('setOutputVolume clamps values to 0-2.0', async () => {
    const pipeline = new AudioPipeline()
    await pipeline.init(new MockMediaStream([new MockMediaStreamTrack()]) as unknown as MediaStream)

    const outputGainNode = (pipeline as unknown as { outputGainNode: MockGainNode }).outputGainNode

    pipeline.setOutputVolume(5)
    expect(outputGainNode.gain.value).toBe(2)

    pipeline.setOutputVolume(-1)
    expect(outputGainNode.gain.value).toBe(0)

    pipeline.setOutputVolume(1.2)
    expect(outputGainNode.gain.value).toBe(1.2)

    pipeline.destroy()
  })

  it('setDucked(true) reduces gain, setDucked(false) restores it', async () => {
    const pipeline = new AudioPipeline()
    await pipeline.init(new MockMediaStream([new MockMediaStreamTrack()]) as unknown as MediaStream)

    const outputGainNode = (pipeline as unknown as { outputGainNode: MockGainNode }).outputGainNode

    pipeline.setOutputVolume(1.0)
    pipeline.setDucked(true, 0.4)
    expect(outputGainNode.gain.value).toBeCloseTo(0.6)

    pipeline.setDucked(false, 0.4)
    expect(outputGainNode.gain.value).toBeCloseTo(1.0)

    pipeline.destroy()
  })

  it('destroy() disconnects all nodes', async () => {
    const pipeline = new AudioPipeline()
    await pipeline.init(new MockMediaStream([new MockMediaStreamTrack()]) as unknown as MediaStream)

    const internals = pipeline as unknown as {
      source: MockAudioNode
      workletNode: MockAudioNode
      micGainNode: MockAudioNode
      outputGainNode: MockAudioNode
      destinationNode: MockAudioNode
    }
    const { source, workletNode, micGainNode, outputGainNode, destinationNode } = internals

    pipeline.destroy()

    expect(source.disconnect).toHaveBeenCalled()
    expect(workletNode.disconnect).toHaveBeenCalled()
    expect(micGainNode.disconnect).toHaveBeenCalled()
    expect(outputGainNode.disconnect).toHaveBeenCalled()
    expect(destinationNode.disconnect).toHaveBeenCalled()
  })
})

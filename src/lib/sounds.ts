export type SoundType = 'join' | 'leave' | 'mute' | 'unmute' | 'message'

interface Tone {
  freq: number
  durationMs: number
}

interface SoundDefinition {
  tones: Tone[]
  volume: number
}

const SOUNDS: Record<SoundType, SoundDefinition> = {
  join: { tones: [{ freq: 880, durationMs: 80 }, { freq: 1100, durationMs: 120 }], volume: 0.3 },
  leave: { tones: [{ freq: 1100, durationMs: 80 }, { freq: 660, durationMs: 120 }], volume: 0.3 },
  mute: { tones: [{ freq: 440, durationMs: 60 }], volume: 0.25 },
  unmute: { tones: [{ freq: 660, durationMs: 60 }], volume: 0.25 },
  message: { tones: [{ freq: 800, durationMs: 100 }], volume: 0.2 },
}

export function playSound(type: SoundType): void {
  try {
    const ctx = new AudioContext()
    const { tones, volume } = SOUNDS[type]

    let startTime = ctx.currentTime
    let totalDurationMs = 0

    for (const tone of tones) {
      const durationSec = tone.durationMs / 1000
      const attackSec = Math.min(0.01, durationSec / 4)

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = tone.freq
      osc.connect(gain)
      gain.connect(ctx.destination)

      gain.gain.setValueAtTime(0, startTime)
      gain.gain.linearRampToValueAtTime(volume, startTime + attackSec)
      gain.gain.linearRampToValueAtTime(0, startTime + durationSec)

      osc.start(startTime)
      osc.stop(startTime + durationSec)

      startTime += durationSec
      totalDurationMs += tone.durationMs
    }

    setTimeout(() => {
      void ctx.close().catch(() => {})
    }, totalDurationMs + 50)
  } catch {
    // silently ignore if audio is not available
  }
}

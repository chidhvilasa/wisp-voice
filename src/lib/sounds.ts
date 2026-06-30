export type SoundType = 'join' | 'leave' | 'mute' | 'unmute' | 'message' | 'friend-request'

interface ToneOptions {
  lowpassFreq?: number
  lowpassQ?: number
  attackSec?: number
}

function withContext(durationMs: number, build: (ctx: AudioContext, master: GainNode) => void): void {
  try {
    const ctx = new AudioContext()
    const master = ctx.createGain()
    master.connect(ctx.destination)
    build(ctx, master)

    setTimeout(() => {
      void ctx.close().catch(() => {})
    }, durationMs + 50)
  } catch {
    // silently ignore if audio is not available
  }
}

// Plays one sine tone into `destination` with a short attack and a linear
// decay to zero by `startSec + durationSec`. `attackSec` defaults to a fast
// (but not instant) ramp so the envelope doesn't click.
function playTone(
  ctx: AudioContext,
  destination: AudioNode,
  freq: number,
  startSec: number,
  durationSec: number,
  peakGain: number,
  options: ToneOptions = {},
): void {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = freq

  const gain = ctx.createGain()
  const attackSec = options.attackSec ?? Math.min(0.01, durationSec / 3)
  const t0 = ctx.currentTime + startSec
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(peakGain, t0 + attackSec)
  gain.gain.linearRampToValueAtTime(0, t0 + durationSec)

  let outNode: AudioNode = osc
  if (options.lowpassFreq) {
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = options.lowpassFreq
    filter.Q.value = options.lowpassQ ?? 1
    osc.connect(filter)
    outNode = filter
  }
  outNode.connect(gain)
  gain.connect(destination)

  osc.start(t0)
  osc.stop(t0 + durationSec)
}

// Discord-style warm tail: replays the same note at half gain, 30ms later.
function playToneWithTail(
  ctx: AudioContext,
  destination: AudioNode,
  freq: number,
  startSec: number,
  durationSec: number,
  peakGain: number,
): void {
  playTone(ctx, destination, freq, startSec, durationSec, peakGain)
  playTone(ctx, destination, freq, startSec + 0.03, durationSec, peakGain * 0.5)
}

function playJoin(): void {
  withContext(260, (ctx, master) => {
    master.gain.value = 0.35
    playToneWithTail(ctx, master, 523, 0, 0.08, 0.4)
    playToneWithTail(ctx, master, 784, 0.06, 0.14, 0.5)
  })
}

function playLeave(): void {
  withContext(260, (ctx, master) => {
    master.gain.value = 0.35
    playToneWithTail(ctx, master, 784, 0, 0.08, 0.4)
    playToneWithTail(ctx, master, 523, 0.06, 0.14, 0.5)
  })
}

function playMute(): void {
  withContext(120, (ctx, master) => {
    master.gain.value = 0.3
    playTone(ctx, master, 220, 0, 0.08, 0.3, { lowpassFreq: 400, lowpassQ: 1.5 })
    playTone(ctx, master, 110, 0, 0.04, 0.2)
  })
}

function playUnmute(): void {
  withContext(100, (ctx, master) => {
    master.gain.value = 0.3
    playTone(ctx, master, 330, 0, 0.06, 0.3, { lowpassFreq: 400, lowpassQ: 1.5 })
    playTone(ctx, master, 165, 0, 0.03, 0.2)
  })
}

function playMessage(): void {
  withContext(310, (ctx, master) => {
    master.gain.value = 0.25
    playTone(ctx, master, 880, 0, 0.305, 0.4, { attackSec: 0.005 })
    playTone(ctx, master, 1760, 0, 0.305, 0.1, { attackSec: 0.005 })
  })
}

function playFriendRequest(): void {
  withContext(160, (ctx, master) => {
    master.gain.value = 0.3
    playTone(ctx, master, 659, 0, 0.1, 0.4, { attackSec: 0.01 })
    playTone(ctx, master, 784, 0.05, 0.1, 0.45, { attackSec: 0.01 })
  })
}

const PLAYERS: Record<SoundType, () => void> = {
  join: playJoin,
  leave: playLeave,
  mute: playMute,
  unmute: playUnmute,
  message: playMessage,
  'friend-request': playFriendRequest,
}

export function playSound(type: SoundType): void {
  PLAYERS[type]()
}

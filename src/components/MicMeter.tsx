import { useEffect, useRef, useState } from 'react'

const SPEAKING_THRESHOLD_DB = -50
const UPDATE_INTERVAL_MS = 50

interface MicMeterProps {
  analyser: AnalyserNode | null
  isMuted: boolean
}

export default function MicMeter({ analyser, isMuted }: MicMeterProps) {
  const [level, setLevel] = useState(0)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const rafRef = useRef<number | null>(null)
  const bufferRef = useRef<Float32Array | null>(null)
  const lastUpdateRef = useRef(0)

  useEffect(() => {
    if (!analyser || isMuted) {
      setLevel(0)
      setIsSpeaking(false)
      return
    }

    if (!bufferRef.current || bufferRef.current.length !== analyser.fftSize) {
      bufferRef.current = new Float32Array(analyser.fftSize)
    }

    const tick = (time: number) => {
      if (document.hidden || time - lastUpdateRef.current < UPDATE_INTERVAL_MS) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      lastUpdateRef.current = time

      const buffer = bufferRef.current!
      analyser.getFloatTimeDomainData(buffer)

      let sumSquares = 0
      for (let i = 0; i < buffer.length; i++) {
        const sample = buffer[i] ?? 0
        sumSquares += sample * sample
      }
      const rms = Math.sqrt(sumSquares / buffer.length)
      const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity

      setLevel(Math.min(100, Math.max(0, rms * 100 * 4)))
      setIsSpeaking(db >= SPEAKING_THRESHOLD_DB)

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [analyser, isMuted])

  if (isMuted || !analyser) return null

  const displayLevel = Math.max(2, level)

  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-surface2">
      <div
        className="h-full rounded-full"
        style={{
          width: `${displayLevel}%`,
          backgroundColor: '#22C55E',
          transition: 'width 80ms ease-out',
          boxShadow: isSpeaking ? '0 0 6px 1px #22C55E' : 'none',
        }}
      />
    </div>
  )
}

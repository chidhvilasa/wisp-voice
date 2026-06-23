import { useEffect, useRef, useState } from 'react'
import { VADProcessor } from '../lib/vad'
import { useSettingsStore } from '../store/settingsStore'
import { useVoiceStore } from '../store/voiceStore'

export function useVAD(stream: MediaStream | null): boolean {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const vadThreshold = useSettingsStore((state) => state.vadThreshold)
  const setLocalSpeaking = useVoiceStore((state) => state.setLocalSpeaking)
  const processorRef = useRef<VADProcessor | null>(null)

  useEffect(() => {
    if (!stream) {
      setIsSpeaking(false)
      setLocalSpeaking(false)
      return
    }

    const processor = new VADProcessor(vadThreshold)
    processorRef.current = processor

    const handleSpeaking = (speaking: boolean) => {
      setIsSpeaking(speaking)
      setLocalSpeaking(speaking)
    }

    processor.on('speaking', handleSpeaking)
    processor.init(stream)

    return () => {
      processor.off('speaking', handleSpeaking)
      processor.destroy()
      processorRef.current = null
      setIsSpeaking(false)
      setLocalSpeaking(false)
    }
    // vadThreshold intentionally omitted: the threshold-change effect below
    // updates the running processor without tearing down the audio graph.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, setLocalSpeaking])

  useEffect(() => {
    processorRef.current?.setThreshold(vadThreshold)
  }, [vadThreshold])

  return isSpeaking
}

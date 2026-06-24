import { useEffect, useRef, useState } from 'react'
import { VADProcessor } from '../lib/vad'
import { useSettingsStore } from '../store/settingsStore'
import { useVoiceStore } from '../store/voiceStore'

export interface UseVADResult {
  isSpeaking: boolean
  analyser: AnalyserNode | null
}

export function useVAD(stream: MediaStream | null): UseVADResult {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const vadThreshold = useSettingsStore((state) => state.vadThreshold)
  const setLocalSpeaking = useVoiceStore((state) => state.setLocalSpeaking)
  const processorRef = useRef<VADProcessor | null>(null)

  useEffect(() => {
    if (!stream) {
      setIsSpeaking(false)
      setLocalSpeaking(false)
      setAnalyser(null)
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
    setAnalyser(processor.getAnalyser())

    return () => {
      processor.off('speaking', handleSpeaking)
      processor.destroy()
      processorRef.current = null
      setIsSpeaking(false)
      setLocalSpeaking(false)
      setAnalyser(null)
    }
    // vadThreshold intentionally omitted: the threshold-change effect below
    // updates the running processor without tearing down the audio graph.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, setLocalSpeaking])

  useEffect(() => {
    processorRef.current?.setThreshold(vadThreshold)
  }, [vadThreshold])

  return { isSpeaking, analyser }
}

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

const POLL_INTERVAL_MS = 2000

interface ResourceUsage {
  cpu_percent: number
  ram_mb: number
}

export default function ResourceWidget() {
  const [usage, setUsage] = useState<ResourceUsage | null>(null)

  useEffect(() => {
    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null

    const poll = async () => {
      try {
        const result = await invoke<ResourceUsage>('get_app_resource_usage')
        if (!cancelled) setUsage(result)
      } catch {
        if (!cancelled) setUsage(null)
      }
    }

    const startPolling = () => {
      if (intervalId !== null) return
      void poll()
      intervalId = setInterval(() => void poll(), POLL_INTERVAL_MS)
    }

    const stopPolling = () => {
      if (intervalId !== null) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling()
      } else {
        startPolling()
      }
    }

    if (!document.hidden) startPolling()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  if (!usage) return null

  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-surface/90 px-3 py-1.5 text-[11px] backdrop-blur">
      <span className="h-1.5 w-1.5 rounded-full bg-speaking animate-dot-pulse" />
      <span className="text-text-secondary">
        CPU {usage.cpu_percent.toFixed(1)}% · RAM {usage.ram_mb}MB
      </span>
      <span className="text-text-tertiary">·</span>
      <span className="font-medium text-accent">Wisp {usage.ram_mb}MB</span>
    </div>
  )
}

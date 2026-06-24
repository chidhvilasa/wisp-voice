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
    <div className="flex flex-col gap-0.5 rounded-full border border-border bg-surface/80 px-3 py-1.5 text-xs text-text-secondary backdrop-blur">
      <span className="font-medium text-text-primary">
        CPU {usage.cpu_percent.toFixed(1)}% · RAM {usage.ram_mb}MB
      </span>
      <span className="text-[11px]">Discord ~400MB | Wisp {usage.ram_mb}MB</span>
    </div>
  )
}

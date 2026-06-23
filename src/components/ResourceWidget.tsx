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

    const poll = async () => {
      try {
        const result = await invoke<ResourceUsage>('get_app_resource_usage')
        if (!cancelled) setUsage(result)
      } catch {
        if (!cancelled) setUsage(null)
      }
    }

    void poll()
    const intervalId = setInterval(() => void poll(), POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [])

  if (!usage) return null

  return (
    <div className="flex flex-col gap-0.5 rounded-card border border-border bg-surface/80 px-3 py-2 text-[11px] text-text-secondary backdrop-blur">
      <span className="font-medium text-text-primary">
        CPU {usage.cpu_percent.toFixed(1)}% · RAM {usage.ram_mb}MB
      </span>
      <span>Discord ~400MB | Wisp {usage.ram_mb}MB</span>
    </div>
  )
}

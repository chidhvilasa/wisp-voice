import { useEffect, useRef, useState } from 'react'
import { Activity } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'

const POLL_INTERVAL_MS = 3000

interface ResourceUsage {
  cpu_percent: number
  ram_mb: number
}

function cpuColor(cpuPercent: number): string {
  if (cpuPercent < 5) return '#22C55E'
  if (cpuPercent <= 15) return '#F59E0B'
  return '#EF4444'
}

function ramColor(ramMb: number): string {
  if (ramMb < 100) return '#22C55E'
  if (ramMb <= 200) return '#F59E0B'
  return '#EF4444'
}

export function PerformanceButton() {
  const [visible, setVisible] = useState(false)
  const [usage, setUsage] = useState<ResourceUsage | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
    }
  }, [])

  if (unavailable) return null

  const poll = async () => {
    try {
      const result = await invoke<ResourceUsage>('get_app_resource_usage')
      setUsage(result)
    } catch {
      setUnavailable(true)
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }

  const handleMouseEnter = () => {
    setVisible(true)
    void poll()
    intervalRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS)
  }

  const handleMouseLeave = () => {
    setVisible(false)
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  return (
    <div
      className="relative inline-flex shrink-0"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        aria-label="Performance"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface2 text-white transition-[filter] hover:brightness-[1.2]"
      >
        <Activity size={18} />
      </button>

      {visible && usage && (
        <div
          className="animate-tooltip-in absolute left-1/2 z-50 rounded-[10px] border px-3.5 py-2.5"
          style={{
            bottom: 'calc(100% + 8px)',
            minWidth: '160px',
            background: '#1A1A1E',
            borderColor: 'rgba(255,255,255,0.1)',
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <span className="text-[11px] text-text-tertiary">CPU</span>
            <span className="text-[13px] font-semibold" style={{ color: cpuColor(usage.cpu_percent) }}>
              {usage.cpu_percent.toFixed(1)}%
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-4">
            <span className="text-[11px] text-text-tertiary">RAM</span>
            <span className="text-[13px] font-semibold" style={{ color: ramColor(usage.ram_mb) }}>
              {usage.ram_mb}MB
            </span>
          </div>
          <div className="my-2 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
          <div className="text-center text-[10px] text-text-tertiary">Wisp only</div>
        </div>
      )}
    </div>
  )
}

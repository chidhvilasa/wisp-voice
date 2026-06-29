import { useState, useEffect } from 'react'
import { Download } from 'lucide-react'
import { checkForUpdate, installUpdate } from '../lib/updater'
import type { UpdateInfo } from '../lib/updater'

const CHECK_DELAY_MS = 5000

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Never check for updates in dev - there's no installed bundle to
    // relaunch into, and it would just hit the network on every dev session.
    if (import.meta.env.DEV) return

    // Check once, 5 seconds after launch, without blocking startup. Checking
    // only on this one-shot timer (no interval) already satisfies "don't
    // check again during the same session" - there's nothing to re-trigger it.
    const timer = setTimeout(() => {
      void checkForUpdate().then((info) => {
        if (info.available) setUpdate(info)
      })
    }, CHECK_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  if (!update || dismissed) return null

  const handleUpdate = () => {
    setInstalling(true)
    void installUpdate((downloaded, total) => {
      if (total) setProgress(Math.round((downloaded / total) * 100))
    }).catch(() => {
      setInstalling(false)
      setProgress(0)
    })
  }

  return (
    <div
      className="animate-slide-down"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#7C5CFC',
        height: '44px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
        <Download size={16} color="white" />
        <span
          style={{
            color: 'white',
            fontSize: '13px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          Wisp {update.version} is available
        </span>
        {installing && (
          <div
            style={{
              flex: 1,
              maxWidth: '160px',
              background: 'rgba(255,255,255,0.3)',
              borderRadius: '2px',
              height: '3px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                background: 'white',
                height: '100%',
                width: `${progress}%`,
                transition: 'width 300ms ease',
                borderRadius: '2px',
              }}
            />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        {!installing ? (
          <>
            <button
              onClick={handleUpdate}
              style={{
                background: 'white',
                color: '#7C5CFC',
                border: 'none',
                borderRadius: '6px',
                height: '32px',
                padding: '0 14px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Update now
            </button>
            <button
              onClick={() => setDismissed(true)}
              style={{
                background: 'transparent',
                color: 'white',
                border: 'none',
                height: '32px',
                padding: '0 10px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Later
            </button>
          </>
        ) : (
          <span style={{ color: 'white', fontSize: '12px' }}>
            {progress > 0 ? `Downloading ${progress}%...` : 'Downloading...'}
          </span>
        )}
      </div>
    </div>
  )
}

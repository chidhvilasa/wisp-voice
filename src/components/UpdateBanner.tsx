import { useState, useEffect } from 'react'
import { checkForUpdate, installUpdate } from '../lib/updater'
import type { UpdateInfo } from '../lib/updater'

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Check for update 3 seconds after app loads
    // Don't block startup
    const timer = setTimeout(() => {
      void checkForUpdate().then((info) => {
        if (info.available) setUpdate(info)
      })
    }, 3000)
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
      style={{
        background: '#7C5CFC',
        borderRadius: '8px',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
        gap: '12px',
      }}
    >
      <div style={{ flex: 1 }}>
        <span style={{ color: 'white', fontSize: '13px', fontWeight: 500 }}>
          Wisp {update.version} is available
        </span>
        {installing && progress > 0 && (
          <div
            style={{
              marginTop: '6px',
              background: 'rgba(255,255,255,0.2)',
              borderRadius: '4px',
              height: '4px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                background: 'white',
                height: '100%',
                width: `${progress}%`,
                transition: 'width 300ms ease',
                borderRadius: '4px',
              }}
            />
          </div>
        )}
      </div>
      {!installing ? (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleUpdate}
            style={{
              background: 'white',
              color: '#7C5CFC',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Update now
          </button>
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Later
          </button>
        </div>
      ) : (
        <span style={{ color: 'white', fontSize: '13px' }}>
          {progress > 0 ? `Downloading ${progress}%...` : 'Preparing...'}
        </span>
      )}
    </div>
  )
}

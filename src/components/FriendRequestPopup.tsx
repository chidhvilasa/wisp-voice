import { useEffect, useState } from 'react'
import { WispLogo } from './wisp/WispLogo'
import { playSound } from '../lib/sounds'
import { useSettingsStore } from '../store/settingsStore'
import type { FriendRequestPayload } from '../lib/presence'

const AUTO_DISMISS_MS = 60000

interface FriendRequestPopupProps {
  request: FriendRequestPayload
  onAccept: () => void
  onDecline: () => void
}

export function FriendRequestPopup({ request, onAccept, onDecline }: FriendRequestPopupProps) {
  const [remainingPercent, setRemainingPercent] = useState(100)

  useEffect(() => {
    if (useSettingsStore.getState().soundEffects) {
      playSound('friend-request')
    }

    const startedAt = Date.now()
    const intervalId = setInterval(() => {
      const elapsed = Date.now() - startedAt
      setRemainingPercent(Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100))
    }, 100)

    const timeoutId = setTimeout(onDecline, AUTO_DISMISS_MS)

    return () => {
      clearInterval(intervalId)
      clearTimeout(timeoutId)
    }
  }, [onDecline])

  return (
    <div className="fixed inset-0 z-[9998] grid place-items-center bg-black/50">
      <div className="animate-popup-in w-[320px] rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <div className="flex flex-col items-center gap-1">
          <WispLogo withWordmark={false} size={32} />
          <h2 className="mt-2 text-base font-semibold">Friend request</h2>
          <p className="text-center text-sm text-text-secondary">
            <span className="font-medium text-text-primary">{request.fromName || 'Someone'}</span> wants to add
            you as a friend on Wisp
          </p>
          <div className="mt-2 font-mono text-sm tracking-[0.2em] text-accent">{request.from}</div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onDecline}
            className="h-10 flex-1 rounded-lg border border-border text-sm font-medium hover:bg-surface2"
          >
            Decline
          </button>
          <button
            type="button"
            autoFocus
            onClick={onAccept}
            className="h-10 flex-1 rounded-lg bg-accent text-sm font-semibold text-primary-foreground hover:bg-accent-hover"
          >
            Add Friend
          </button>
        </div>

        <div className="mt-4 h-1 overflow-hidden rounded-full bg-surface2">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${remainingPercent}%`, transition: 'width 100ms linear' }}
          />
        </div>
      </div>
    </div>
  )
}

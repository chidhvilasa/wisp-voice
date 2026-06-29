import { useCallback, useEffect, useState } from 'react'
import { getWispId } from '../lib/identity'
import { presenceClient } from '../lib/presence'
import type { InvitePayload } from '../lib/presence'

export interface UsePresenceResult {
  activeInvite: InvitePayload | null
  clearInvite: () => void
}

export function usePresence(): UsePresenceResult {
  const [activeInvite, setActiveInvite] = useState<InvitePayload | null>(null)

  useEffect(() => {
    // Skip the real network connection under the test runner; tests don't
    // stub WebSocket/fetch for this endpoint and shouldn't depend on a live
    // presence server.
    if (import.meta.env.MODE === 'test') return

    const wispId = getWispId()
    presenceClient.connect(wispId, (invite) => {
      setActiveInvite(invite)
    })
    return () => {
      presenceClient.disconnect()
    }
  }, [])

  const clearInvite = useCallback(() => setActiveInvite(null), [])

  return { activeInvite, clearInvite }
}

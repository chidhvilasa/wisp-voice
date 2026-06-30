import { useCallback, useEffect, useRef, useState } from 'react'
import { getWispId } from '../lib/identity'
import { presenceClient } from '../lib/presence'
import { addFriendRequest, confirmFriend } from '../lib/friends'
import type { FriendRequestPayload, InvitePayload } from '../lib/presence'

const INVITE_EXPIRY_MS = 60000

export interface UsePresenceResult {
  activeInvite: InvitePayload | null
  clearInvite: () => void
  markInviteUsed: (roomCode: string) => void
  activeFriendRequest: FriendRequestPayload | null
  clearFriendRequest: () => void
}

export function usePresence(): UsePresenceResult {
  const [activeInvite, setActiveInvite] = useState<InvitePayload | null>(null)
  const [activeFriendRequest, setActiveFriendRequest] = useState<FriendRequestPayload | null>(null)
  const usedInvites = useRef<Set<string>>(new Set())

  useEffect(() => {
    // Skip the real network connection under the test runner; tests don't
    // stub WebSocket/fetch for this endpoint and shouldn't depend on a live
    // presence server.
    if (import.meta.env.MODE === 'test') return

    const wispId = getWispId()
    const receivedAt = new Map<string, number>()

    presenceClient.connect(wispId, {
      onInvite: (invite) => {
        // A duplicate delivery or a reconnect replay of the same invite
        // could otherwise show the popup again right after the user already
        // joined that room - once a room code has been accepted, never
        // show it again for the life of this session.
        if (usedInvites.current.has(invite.roomCode)) return

        const firstSeenAt = receivedAt.get(invite.roomCode) ?? Date.now()
        receivedAt.set(invite.roomCode, firstSeenAt)
        if (Date.now() - firstSeenAt > INVITE_EXPIRY_MS) return

        setActiveInvite(invite)
      },
      onFriendRequest: (request) => {
        // Persist immediately so the request still shows up in the Friends
        // tab even if the popup gets missed, dismissed, or times out.
        addFriendRequest({ ...request, receivedAt: Date.now() })
        setActiveFriendRequest(request)
      },
      onFriendAccepted: (payload) => {
        confirmFriend(payload.from, payload.name)
      },
    })
    return () => {
      presenceClient.disconnect()
    }
  }, [])

  const clearInvite = useCallback(() => setActiveInvite(null), [])
  const markInviteUsed = useCallback((roomCode: string) => {
    usedInvites.current.add(roomCode)
  }, [])
  const clearFriendRequest = useCallback(() => setActiveFriendRequest(null), [])

  return { activeInvite, clearInvite, markInviteUsed, activeFriendRequest, clearFriendRequest }
}

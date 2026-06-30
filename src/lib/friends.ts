import { getWispId, getDisplayName } from './identity'
import { presenceClient } from './presence'

const FRIENDS_KEY = 'wisp-friends'
const REQUESTS_KEY = 'wisp-friend-requests'
const PENDING_OUTGOING_KEY = 'wisp-pending-outgoing'
const WISP_ID_PATTERN = /^[A-Z0-9]{8}$/

export interface Friend {
  wispId: string
  name: string
  addedAt: number
  online: boolean
}

export interface FriendRequest {
  from: string
  fromName: string
  receivedAt: number
}

export interface PendingOutgoing {
  wispId: string
  sentAt: number
}

function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as T[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeList<T>(key: string, list: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    // localStorage unavailable or full; best-effort persistence
  }
}

export function isValidWispId(wispId: string): boolean {
  return WISP_ID_PATTERN.test(wispId)
}

// ---- Friends ----

export function getFriends(): Friend[] {
  return readList<Friend>(FRIENDS_KEY)
}

function saveFriends(friends: Friend[]): void {
  writeList(FRIENDS_KEY, friends)
}

export function removeFriend(wispId: string): void {
  saveFriends(getFriends().filter((friend) => friend.wispId !== wispId))
}

export function updateFriendName(wispId: string, name: string): void {
  saveFriends(
    getFriends().map((friend) =>
      friend.wispId === wispId ? { ...friend, name: name.trim() || friend.name } : friend,
    ),
  )
}

export function setFriendOnline(wispId: string, online: boolean): void {
  saveFriends(getFriends().map((friend) => (friend.wispId === wispId ? { ...friend, online } : friend)))
}

// ---- Outgoing friend requests (sent by us, awaiting their acceptance) ----

export function getPendingOutgoing(): PendingOutgoing[] {
  return readList<PendingOutgoing>(PENDING_OUTGOING_KEY)
}

function addPendingOutgoing(wispId: string): void {
  const existing = getPendingOutgoing().filter((entry) => entry.wispId !== wispId)
  writeList(PENDING_OUTGOING_KEY, [...existing, { wispId, sentAt: Date.now() }])
}

function removePendingOutgoing(wispId: string): void {
  writeList(PENDING_OUTGOING_KEY, getPendingOutgoing().filter((entry) => entry.wispId !== wispId))
}

// ---- Incoming friend requests (sent to us, awaiting our accept/decline) ----

export function getPendingRequests(): FriendRequest[] {
  return readList<FriendRequest>(REQUESTS_KEY)
}

export function addFriendRequest(request: FriendRequest): void {
  const existing = getPendingRequests().filter((entry) => entry.from !== request.from)
  writeList(REQUESTS_KEY, [...existing, request])
}

export function declineRequest(fromWispId: string): void {
  writeList(REQUESTS_KEY, getPendingRequests().filter((entry) => entry.from !== fromWispId))
}

export function acceptRequest(fromWispId: string): Friend {
  const request = getPendingRequests().find((entry) => entry.from === fromWispId)
  if (!request) {
    throw new Error('That friend request no longer exists.')
  }

  const friend: Friend = {
    wispId: request.from,
    name: request.fromName.trim() || request.from,
    addedAt: Date.now(),
    online: true,
  }
  saveFriends([...getFriends().filter((f) => f.wispId !== fromWispId), friend])
  declineRequest(fromWispId)

  void presenceClient.sendFriendAccepted(fromWispId, getDisplayName())

  return friend
}

// Called when a 'friend-accepted' message arrives back for a request we sent.
export function confirmFriend(wispId: string, name: string): Friend {
  removePendingOutgoing(wispId)
  const friend: Friend = {
    wispId,
    name: name.trim() || wispId,
    addedAt: Date.now(),
    online: true,
  }
  saveFriends([...getFriends().filter((f) => f.wispId !== wispId), friend])
  return friend
}

// ---- Sending a new friend request ----

export async function addFriend(wispId: string): Promise<void> {
  const normalizedId = wispId.toUpperCase()
  if (!isValidWispId(normalizedId)) {
    throw new Error('Wisp ID must be exactly 8 alphanumeric characters.')
  }
  if (normalizedId === getWispId()) {
    throw new Error("That's your own Wisp ID.")
  }
  if (getFriends().some((friend) => friend.wispId === normalizedId)) {
    throw new Error('This Wisp ID is already in your friends list.')
  }
  if (getPendingOutgoing().some((entry) => entry.wispId === normalizedId)) {
    throw new Error('You already sent a request to this Wisp ID.')
  }

  const delivered = await presenceClient.sendFriendRequest(normalizedId, getDisplayName())
  if (!delivered) {
    throw new Error("Couldn't reach that Wisp ID right now. They may be offline — try again later.")
  }

  addPendingOutgoing(normalizedId)
}

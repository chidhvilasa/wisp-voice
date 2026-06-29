const FRIENDS_KEY = 'wisp-friends'
const WISP_ID_PATTERN = /^[A-Z0-9]{8}$/

export interface Friend {
  wispId: string
  name: string
  addedAt: number
  online: boolean
}

export function getFriends(): Friend[] {
  try {
    const raw = localStorage.getItem(FRIENDS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Friend[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveFriends(friends: Friend[]): void {
  try {
    localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends))
  } catch {
    // localStorage unavailable or full; best-effort persistence
  }
}

export function isValidWispId(wispId: string): boolean {
  return WISP_ID_PATTERN.test(wispId)
}

export function addFriend(wispId: string, name: string): Friend {
  const normalizedId = wispId.toUpperCase()
  if (!isValidWispId(normalizedId)) {
    throw new Error('Wisp ID must be exactly 8 alphanumeric characters.')
  }

  const friends = getFriends()
  if (friends.some((friend) => friend.wispId === normalizedId)) {
    throw new Error('This Wisp ID is already in your friends list.')
  }

  const friend: Friend = {
    wispId: normalizedId,
    name: name.trim() || normalizedId,
    addedAt: Date.now(),
    online: false,
  }
  saveFriends([...friends, friend])
  return friend
}

export function removeFriend(wispId: string): void {
  const friends = getFriends().filter((friend) => friend.wispId !== wispId)
  saveFriends(friends)
}

export function updateFriendName(wispId: string, name: string): void {
  const friends = getFriends().map((friend) =>
    friend.wispId === wispId ? { ...friend, name: name.trim() || friend.name } : friend,
  )
  saveFriends(friends)
}

export function setFriendOnline(wispId: string, online: boolean): void {
  const friends = getFriends().map((friend) => (friend.wispId === wispId ? { ...friend, online } : friend))
  saveFriends(friends)
}

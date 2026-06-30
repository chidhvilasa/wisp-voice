import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getWispId } from './identity'

const { sendFriendRequest, sendFriendAccepted } = vi.hoisted(() => ({
  sendFriendRequest: vi.fn().mockResolvedValue(true),
  sendFriendAccepted: vi.fn().mockResolvedValue(true),
}))

vi.mock('./presence', () => ({
  presenceClient: { sendFriendRequest, sendFriendAccepted },
}))

const { addFriend, getFriends, removeFriend } = await import('./friends')

class MockLocalStorage {
  private store = new Map<string, string>()

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}

describe('identity', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MockLocalStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('getWispId() returns the same ID on repeated calls', () => {
    const first = getWispId()
    const second = getWispId()
    const third = getWispId()
    expect(second).toBe(first)
    expect(third).toBe(first)
    expect(first).toMatch(/^[A-Z0-9]{8}$/)
  })
})

describe('friends', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MockLocalStorage())
    sendFriendRequest.mockClear().mockResolvedValue(true)
    sendFriendAccepted.mockClear().mockResolvedValue(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('getFriends() returns an empty array when localStorage is empty', () => {
    expect(getFriends()).toEqual([])
  })

  it('addFriend() validates the Wisp ID format', async () => {
    await expect(addFriend('short')).rejects.toThrow(/8 alphanumeric/i)
    await expect(addFriend('toolongwispid')).rejects.toThrow(/8 alphanumeric/i)
    expect(sendFriendRequest).not.toHaveBeenCalled()
  })

  it('addFriend() sends a request and stores it as pending, not as an immediate friend', async () => {
    await addFriend('abcd1234')
    expect(sendFriendRequest).toHaveBeenCalledWith('ABCD1234', expect.any(String))
    expect(getFriends()).toEqual([])
  })

  it('addFriend() rejects duplicate IDs that are already friends', async () => {
    localStorage.setItem(
      'wisp-friends',
      JSON.stringify([{ wispId: 'ABCD1234', name: 'Bob', addedAt: Date.now(), online: false }]),
    )
    await expect(addFriend('ABCD1234')).rejects.toThrow(/already/i)
  })

  it('removeFriend() removes the matching friend', () => {
    localStorage.setItem(
      'wisp-friends',
      JSON.stringify([
        { wispId: 'ABCD1234', name: 'Bob', addedAt: Date.now(), online: false },
        { wispId: 'WXYZ7890', name: 'Alice', addedAt: Date.now(), online: false },
      ]),
    )
    expect(getFriends()).toHaveLength(2)

    removeFriend('ABCD1234')

    const remaining = getFriends()
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.wispId).toBe('WXYZ7890')
  })
})

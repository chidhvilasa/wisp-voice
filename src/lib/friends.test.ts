import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getWispId } from './identity'
import { addFriend, getFriends, removeFriend } from './friends'

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
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('getFriends() returns an empty array when localStorage is empty', () => {
    expect(getFriends()).toEqual([])
  })

  it('addFriend() validates the Wisp ID format', () => {
    expect(() => addFriend('short', 'Bob')).toThrow(/8 alphanumeric/i)
    expect(() => addFriend('toolongwispid', 'Bob')).toThrow(/8 alphanumeric/i)

    const friend = addFriend('abcd1234', 'Bob')
    expect(friend.wispId).toBe('ABCD1234')
    expect(getFriends()).toHaveLength(1)
  })

  it('addFriend() rejects duplicate IDs', () => {
    addFriend('ABCD1234', 'Bob')
    expect(() => addFriend('ABCD1234', 'Bob Again')).toThrow(/already/i)
    expect(getFriends()).toHaveLength(1)
  })

  it('removeFriend() removes the matching friend', () => {
    addFriend('ABCD1234', 'Bob')
    addFriend('WXYZ7890', 'Alice')
    expect(getFriends()).toHaveLength(2)

    removeFriend('ABCD1234')

    const remaining = getFriends()
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.wispId).toBe('WXYZ7890')
  })
})

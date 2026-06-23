import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoom, getRecentRooms, joinRoom, removeRecentRoom, saveRecentRoom } from './rooms'
import type { RecentRoom } from '../types'

function makeRoom(code: string, lastUsed: number): RecentRoom {
  return { code, name: `Room ${code}`, lastUsed, memberCount: 1 }
}

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

describe('rooms', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MockLocalStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('createRoom', () => {
    it('returns a 6-char string', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ code: 'AB12CD' }),
        }),
      )

      const code = await createRoom()
      expect(code).toHaveLength(6)
    })

    it('throws a user-friendly error on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

      await expect(createRoom()).rejects.toThrow(/unable to create a room/i)
    })
  })

  describe('getRecentRooms', () => {
    it('returns an empty array when localStorage is empty', () => {
      expect(getRecentRooms()).toEqual([])
    })
  })

  describe('saveRecentRoom', () => {
    it('keeps max 5 entries and deduplicates by code', () => {
      for (let i = 0; i < 5; i++) {
        saveRecentRoom(makeRoom(`CODE0${i}`, i))
      }
      saveRecentRoom(makeRoom('CODE00', 99))

      const rooms = getRecentRooms()
      expect(rooms).toHaveLength(5)
      expect(rooms.filter((room) => room.code === 'CODE00')).toHaveLength(1)
      expect(rooms[0]?.code).toBe('CODE00')
    })
  })

  describe('removeRecentRoom', () => {
    it('removes the entry with the matching code', () => {
      saveRecentRoom(makeRoom('AAA111', 1))
      saveRecentRoom(makeRoom('BBB222', 2))

      removeRecentRoom('AAA111')

      const rooms = getRecentRooms()
      expect(rooms).toHaveLength(1)
      expect(rooms[0]?.code).toBe('BBB222')
    })
  })

  describe('joinRoom', () => {
    it('rejects codes that are not 6 alphanumeric characters', async () => {
      await expect(joinRoom('ABC')).rejects.toThrow(/6 alphanumeric characters/i)
      await expect(joinRoom('TOOLONGCODE')).rejects.toThrow(/6 alphanumeric characters/i)
      await expect(joinRoom('AB-12C')).rejects.toThrow(/6 alphanumeric characters/i)
    })

    it('rejects empty string', async () => {
      await expect(joinRoom('')).rejects.toThrow(/6 alphanumeric characters/i)
    })
  })
})

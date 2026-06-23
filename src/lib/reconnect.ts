export const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 30000]
export const MAX_RECONNECT_ATTEMPTS = RECONNECT_DELAYS_MS.length

export interface ReconnectScheduler {
  scheduleReconnect: () => void
  reset: () => void
  cancel: () => void
  attempts: () => number
}

export function createReconnectScheduler(
  attempt: () => Promise<void>,
  onExhausted: () => void,
): ReconnectScheduler {
  let attempts = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  function cancel(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function reset(): void {
    cancel()
    attempts = 0
  }

  function scheduleReconnect(): void {
    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
      onExhausted()
      return
    }

    const delay = RECONNECT_DELAYS_MS[attempts] ?? RECONNECT_DELAYS_MS[RECONNECT_DELAYS_MS.length - 1]
    attempts += 1

    cancel()
    timer = setTimeout(() => {
      attempt()
        .then(() => {
          attempts = 0
        })
        .catch(() => {
          scheduleReconnect()
        })
    }, delay)
  }

  return { scheduleReconnect, reset, cancel, attempts: () => attempts }
}

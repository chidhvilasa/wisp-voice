const SIGNALING_HOST = 'wisp-signaling.chidhvilasa2004.workers.dev'
const PRESENCE_RECONNECT_DELAY_MS = 5000

export interface InvitePayload {
  from: string
  fromName: string
  roomCode: string
}

export class PresenceClient {
  private ws: WebSocket | null = null
  private wispId = ''
  private onInvite: ((invite: InvitePayload) => void) | null = null
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = false

  connect(wispId: string, onInvite: (invite: InvitePayload) => void): void {
    this.wispId = wispId
    this.onInvite = onInvite
    this.shouldReconnect = true
    this.open()
  }

  disconnect(): void {
    this.shouldReconnect = false
    if (this.reconnectTimeoutId !== null) {
      clearTimeout(this.reconnectTimeoutId)
      this.reconnectTimeoutId = null
    }
    if (this.ws) {
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.close()
      this.ws = null
    }
  }

  async sendInvite(toWispId: string, fromName: string, roomCode: string): Promise<boolean> {
    try {
      const response = await fetch(`https://${SIGNALING_HOST}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.wispId, fromName, to: toWispId, roomCode }),
      })
      return response.ok
    } catch {
      return false
    }
  }

  private open(): void {
    if (!this.shouldReconnect) return

    try {
      const ws = new WebSocket(`wss://${SIGNALING_HOST}/presence/${this.wispId}/ws`)
      this.ws = ws

      ws.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data as string) as Partial<InvitePayload> & { type?: string }
          if (
            message.type === 'room-invite' &&
            typeof message.from === 'string' &&
            typeof message.roomCode === 'string'
          ) {
            this.onInvite?.({
              from: message.from,
              fromName: typeof message.fromName === 'string' ? message.fromName : '',
              roomCode: message.roomCode,
            })
          }
        } catch {
          // ignore malformed presence messages
        }
      }
      ws.onclose = () => {
        this.scheduleReconnect()
      }
      ws.onerror = () => {
        // onclose fires next and schedules the retry; nothing else to do here
      }
    } catch {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectTimeoutId !== null) return
    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null
      this.open()
    }, PRESENCE_RECONNECT_DELAY_MS)
  }
}

export const presenceClient = new PresenceClient()

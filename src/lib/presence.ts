const SIGNALING_HOST = 'wisp-signaling.chidhvilasa2004.workers.dev'
const PRESENCE_RECONNECT_DELAY_MS = 5000

export interface InvitePayload {
  from: string
  fromName: string
  roomCode: string
}

export interface FriendRequestPayload {
  from: string
  fromName: string
}

export interface FriendAcceptedPayload {
  from: string
  name: string
}

export interface PresenceHandlers {
  onInvite?: (invite: InvitePayload) => void
  onFriendRequest?: (request: FriendRequestPayload) => void
  onFriendAccepted?: (payload: FriendAcceptedPayload) => void
}

interface IncomingMessage {
  type?: string
  from?: string
  fromName?: string
  roomCode?: string
  name?: string
}

export class PresenceClient {
  private ws: WebSocket | null = null
  private wispId = ''
  private handlers: PresenceHandlers = {}
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = false

  connect(wispId: string, handlers: PresenceHandlers): void {
    this.wispId = wispId
    this.handlers = handlers
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
    return this.post('/invite', { from: this.wispId, fromName, to: toWispId, roomCode })
  }

  async sendFriendRequest(toWispId: string, fromName: string): Promise<boolean> {
    return this.post('/friend-request', { from: this.wispId, fromName, to: toWispId })
  }

  async sendFriendAccepted(toWispId: string, name: string): Promise<boolean> {
    return this.post('/friend-accept', { from: this.wispId, name, to: toWispId })
  }

  private async post(path: string, body: Record<string, string>): Promise<boolean> {
    try {
      const response = await fetch(`https://${SIGNALING_HOST}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
          const message = JSON.parse(event.data as string) as IncomingMessage
          if (
            message.type === 'room-invite' &&
            typeof message.from === 'string' &&
            typeof message.roomCode === 'string'
          ) {
            this.handlers.onInvite?.({
              from: message.from,
              fromName: typeof message.fromName === 'string' ? message.fromName : '',
              roomCode: message.roomCode,
            })
          } else if (message.type === 'friend-request' && typeof message.from === 'string') {
            this.handlers.onFriendRequest?.({
              from: message.from,
              fromName: typeof message.fromName === 'string' ? message.fromName : '',
            })
          } else if (message.type === 'friend-accepted' && typeof message.from === 'string') {
            this.handlers.onFriendAccepted?.({
              from: message.from,
              name: typeof message.name === 'string' ? message.name : '',
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

// Shared WebSocket client for the Go chat backend (server.go -> /ws/chat).
//
// The Go WS endpoint talks JSON in snake_case (see WSRequest/WSMessage/
// WSEvent in server.go):
//   -> { "type": "subscribe", "conversation_id": "...", "sender_type": "doctor"|"patient", "sender_id": "..." }
//   -> { "type": "message",   "conversation_id": "...", "sender_type": "...", "sender_id": "...", "message": "..." }
//   <- { "type": "connected" } | { "type": "subscribed" } | { "type": "message.created", "message": {...} } | { "type": "error", "error": "..." }
//
// A message payload (Go `Message` struct) looks like:
//   { "id", "conversation_id", "sender_type", "sender_id", "message", "image", "created_at" }
//
// Why does the client not use window.location.origin by default?
// The SvelteKit app has no /ws/chat route; the WebSocket is served by the Go
// server on its own host (localhost:3000 in dev, env DOCTORS_WS_URL, or the
// public API host in prod). The constructor therefore takes the full WS URL
// explicitly.

// Optional explicit override — set in .env / .env.local:
//   DOCTORS_WS_URL=wss://goserverapi.vercel.app/ws/chat   (prod)
//   DOCTORS_WS_URL=ws://localhost:3000/ws/chat            (local Go server)
// Vite only injects VITE_-prefixed variables by default; the SvelteKit proxy
// routes use $env/dynamic/private, so DOCTORS_WS_URL is read here through
// import.meta.env and falls back in chat.js when undefined.
export const WS_URL: string | undefined = import.meta.env?.DOCTORS_WS_URL;

export interface ChatMessagePayload {
  id: string;
  conversation_id: string;
  sender_type: string;
  sender_id: string;
  message: string;
  image: string;
  created_at: string;
}

export interface ChatWSEvent {
  type: string; // connected | subscribed | message.created | error
  message?: ChatMessagePayload;
  error?: string;
}

export interface WSClient {
  ws: WebSocket | null;
  url: string;
  isConnecting: boolean;
  onMessage?: (event: ChatWSEvent) => void;
  onError?: (error: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
  connect(): Promise<void>;
  disconnect(): void;
  cleanup(): void;
  subscribe(conversationId: string, senderType: string, senderId: string): void;
  unsubscribe(conversationId: string): void;
  sendMessage(conversationId: string, senderType: string, senderId: string, message: string): void;
}

class BreezeWSClient implements WSClient {
  ws: WebSocket | null = null;
  url: string;
  isConnecting = false;
  onMessage?: (event: ChatWSEvent) => void;
  onError?: (error: string) => void;
  onOpen?: () => void;
  onClose?: () => void;

  constructor(url: string) {
    this.url = url;
  }

  async connect(): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;

    try {
      this.ws = new WebSocket(this.url);
      const socket = this.ws;

      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => {
          this.isConnecting = false;
          this.onOpen?.();
          resolve();
        };
        socket.onmessage = (event) => {
          let data: ChatWSEvent;
          try {
            data = JSON.parse(String(event.data));
          } catch {
            this.handleError(`Invalid message format: ${event.data}`);
            return;
          }
          if (data.type === 'message.created' && data.message) {
            this.onMessage?.(data);
          } else if (data.type === 'error') {
            this.handleError(data.error || 'Unknown error');
          } else {
            // 'connected' / 'subscribed' — surface as onMessage so callers can log.
            this.onMessage?.(data);
          }
        };
        socket.onclose = () => {
          this.isConnecting = false;
          this.ws = null;
          this.onClose?.();
        };
        socket.onerror = () => {
          this.isConnecting = false;
          this.handleError('WebSocket error');
        };
      });
    } catch (error) {
      this.isConnecting = false;
      this.handleError(`Failed to connect: ${error}`);
      throw error;
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnecting = false;
  }

  cleanup(): void {
    this.disconnect();
    this.onMessage = undefined;
    this.onError = undefined;
    this.onOpen = undefined;
    this.onClose = undefined;
  }

  /**
   * Subscribe this socket to one conversation. The Go server tracks the
   * subscription per socket (not per conversation id), so switching
   * conversations means sending another subscribe frame.
   */
  subscribe(conversationId: string, senderType: string, senderId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.handleError('WebSocket not connected');
      return;
    }
    this.ws.send(
      JSON.stringify({
        type: 'subscribe',
        conversation_id: conversationId,
        sender_type: senderType,
        sender_id: senderId
      })
    );
  }

  unsubscribe(_conversationId: string): void {
    // There is no unsubscribe frame in server.go; just forget local state.
  }

  sendMessage(conversationId: string, senderType: string, senderId: string, message: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.handleError('WebSocket not connected');
      return;
    }
    this.ws.send(
      JSON.stringify({
        type: 'message',
        conversation_id: conversationId,
        sender_type: senderType,
        sender_id: senderId,
        message
      })
    );
  }

  private handleError(error: string): void {
    console.error('WebSocket error:', error);
    this.onError?.(error);
  }
}

export function createWSClient(url: string): WSClient {
  return new BreezeWSClient(url);
}
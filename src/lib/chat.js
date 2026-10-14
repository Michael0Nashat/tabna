// ---------------------------------------------------------------------------
// Live-chat helpers shared by the patient and doctor dashboards.
//
// Two transports are used together:
//
//   1. REST — GET/POST /api/conversations/:id/messages (proxied to the Go
//      backend). This is the source of truth for *history*: it works even
//      when the socket is down and always returns the stored rows.
//
//   2. WebSocket — /ws/chat on the Go server. This only *pushes* new
//      `message.created` events for the conversation you subscribe to, so
//      the peer's reply shows up instantly without polling.
//
// `openChatSocket` wires both up: it sends over the socket when it is open
// and transparently falls back to the REST POST when it is not, so a
// message is never lost just because the socket dropped.
// ---------------------------------------------------------------------------

import { createWSClient, WS_URL } from './ws-chat-client';

/**
 * @typedef {import('./ws-chat-client').ChatMessagePayload} ChatMessage
 * @typedef {import('./ws-chat-client').WSClient} WSClient
 * @typedef {'socket' | 'rest' | 'poll'} IncomingSource
 */

/** Resolve the Go WebSocket endpoint for the current page. */
export function resolveWSUrl() {
  if (WS_URL) return WS_URL;
  // Dev: the Go server runs on localhost:3000 alongside the Svelte app.
  return `ws://${window.location.hostname}:3000/ws/chat`;
}

/**
 * Fetch the history of a conversation through the SvelteKit proxy.
 *
 * @param {string} conversationId
 * @returns {Promise<ChatMessage[]>}
 */
export async function loadMessages(conversationId) {
  const res = await fetch(`/api/conversations/${conversationId}/messages`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.messages) ? data.messages : [];
}

/**
 * POST a message through the REST proxy (reliable fallback when the socket
 * is down) and return the stored row.
 *
 * @param {string} conversationId
 * @param {string} senderType 'doctor' | 'patient'
 * @param {string} senderId
 * @param {string} text
 * @returns {Promise<ChatMessage|null>}
 */
export async function sendViaREST(conversationId, senderType, senderId, text) {
  const res = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sender_type: senderType,
      sender_id: senderId,
      message: text
    })
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload?.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  // The proxy returns the full Go `Message` row (see messages/+server.js).
  return data && typeof data === 'object' && data.message
    ? {
        id: data.message.id,
        conversation_id: data.message.conversation_id,
        sender_type: data.message.sender_type,
        sender_id: data.message.sender_id,
        message: data.message.message,
        image: data.message.image_data || '',
        created_at: data.message.created_at || ''
      }
    : null;
}

/**
 * Own a socket for one chat session. Returns the live client plus a dispose
 * function that must be called on unmount / conversation switch so a stale
 * socket does not keep pushing into the next chat.
 *
 * The socket is the fast path: it pushes `message.created` the instant the Go
 * server stores a peer message. If the socket is down (Go server unreachable,
 * wrong port, dropped connection), `openChatSocket` transparently falls back
 * to polling the REST history API (immediately, then every 2.5s) so the peer
 * still receives your messages "at the same moment" — they are never lost.
 *
 * @param {object} opts
 * @param {string} opts.conversationId
 * @param {string} opts.senderType
 * @param {string} opts.senderId
 * @param {(msg: ChatMessage, meta: { source: IncomingSource }) => void} [opts.onIncoming]
 *        append a new message (the peer's, or your own via the REST fallback)
 * @param {(error: string) => void} [opts.onError]
 * @returns {{ client: WSClient, send: (text: string) => void, dispose: () => void }}
 */
export function openChatSocket({ conversationId, senderType, senderId, onIncoming, onError }) {
  const client = createWSClient(resolveWSUrl());

  // When the socket is down (Go server unreachable / dropped), a peer's message
  // cannot be pushed to this client, so fall back to polling the REST history
  // API. Bounded by deduped ids so a message is surfaced exactly once no matter
  // how many transports (socket push / REST send / poll) deliver it.
  let closed = false;
  /** @type {number | null} Polling timer id, or null when the socket is live. */
  let pollTimer = null;
  /** Message ids already surfaced (dedupe polling against socket pushes). */
  const lastSeen = new Set();

  const clearPolling = () => {
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  const pollOnce = () => {
    if (closed) return;
    loadMessages(conversationId)
      .then((rows) => {
        if (closed) return;
        for (const m of rows) {
          if (lastSeen.has(m.id)) continue;
          lastSeen.add(m.id);
          // Only surface messages the peer authored: our own sends are already
          // surfaced by send() / the REST fallback path.
          if (m.sender_type !== senderType) onIncoming?.(m, { source: 'poll' });
        }
      })
      .catch(() => {
        /* transient network failure: keep polling */
      });
  };

  client.onClose = () => {
    if (closed || typeof window === 'undefined') return;
    clearPolling();
    pollOnce();
    pollTimer = window.setInterval(pollOnce, 2500);
  };

  client.onOpen = () => {
    if (closed || typeof window === 'undefined') return;
    clearPolling();
    // Re-subscribe so live pushes resume, and clear the dedupe set so any peer
    // message sent while we were offline lands exactly once via the socket.
    lastSeen.clear();
    client.subscribe(conversationId, senderType, senderId);
  };

  client.onMessage = (event) => {
    if (event.type === 'message.created' && event.message) {
      // Only accept events for the conversation we subscribe to; the Go
      // server already routes per-socket, but never trust the wire twice.
      if (event.message.conversation_id === conversationId) {
        lastSeen.add(event.message.id);
        onIncoming?.(event.message, { source: 'socket' });
      }
    }
  };

  if (onError) client.onError = onError;

  /**
   * Send over the socket when it is open; otherwise fall back to REST so the
   * message is stored regardless of socket state.
   * @param {string} text
   */
  const send = (text) => {
    if (client.ws && client.ws.readyState === WebSocket.OPEN) {
      client.sendMessage(conversationId, senderType, senderId, text);
    } else {
      sendViaREST(conversationId, senderType, senderId, text)
        .then((msg) => {
          // REST path returns the stored row — treat it as the same payload
          // the socket would have pushed, so the UI behaves identically.
          if (msg) {
            lastSeen.add(msg.id);
            onIncoming?.(msg, { source: 'rest' });
          }
        })
        .catch((err) => onError?.(err instanceof Error ? err.message : String(err)));
    }
  };

  client
    .connect()
    .then(() => {
      if (!closed) client.subscribe(conversationId, senderType, senderId);
    })
    .catch((err) => {
      // Socket failed to open (Go server down / wrong port). The REST polling
      // fallback in onClose still delivers peer messages, so this is not fatal.
      onError?.(err instanceof Error ? err.message : String(err));
    });

  const dispose = () => {
    closed = true;
    clearPolling();
    client.cleanup();
  };

  return { client, send, dispose };
}
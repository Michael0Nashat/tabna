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
 * @param {object} opts
 * @param {string} opts.conversationId
 * @param {string} opts.senderType
 * @param {string} opts.senderId
 * @param {(msg: ChatMessage) => void} opts.onIncoming append the peer's new message
 * @param {(error: string) => void} [opts.onError]
 * @returns {{ client: WSClient, send: (text: string) => void, dispose: () => void }}
 */
export function openChatSocket({ conversationId, senderType, senderId, onIncoming, onError }) {
  const client = createWSClient(resolveWSUrl());

  client.onMessage = (event) => {
    if (event.type === 'message.created' && event.message) {
      // Only accept events for the conversation we subscribe to; the Go
      // server already routes per-socket, but never trust the wire twice.
      if (event.message.conversation_id === conversationId) {
        onIncoming(event.message);
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
          if (msg) onIncoming(msg);
        })
        .catch((err) => onError?.(err instanceof Error ? err.message : String(err)));
    }
  };

  client
    .connect()
    .then(() => client.subscribe(conversationId, senderType, senderId))
    .catch((err) => {
      // Socket failed to open (Go server down / wrong port). The REST
      // fallback still works, so this is not fatal.
      onError?.(err instanceof Error ? err.message : String(err));
    });

  const dispose = () => client.cleanup();

  return { client, send, dispose };
}
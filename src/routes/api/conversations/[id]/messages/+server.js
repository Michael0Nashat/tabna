import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

const DEFAULT_API_BASE = 'https://goserverapi.vercel.app';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** @returns {string} */
function getApiBase() {
	const base = env.DOCTORS_API_URL || DEFAULT_API_BASE;
	return base.replace(/\/+$/, '');
}

/**
 * Proxies GET /conversations/:id/messages from the Go API.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ params, fetch }) {
	const { id } = params;

	if (!UUID_RE.test(id)) {
		return json({ error: 'Invalid conversation id' }, { status: 400 });
	}

	/** @type {Response} */
	let upstream;

	try {
		upstream = await fetch(`${getApiBase()}/conversations/${id}/messages`, {
			headers: { accept: 'application/json' }
		});
	} catch (cause) {
		return json(
			{ error: 'Cannot reach the messages API', details: String(cause) },
			{ status: 502 }
		);
	}

	const raw = await upstream.text();

	/** @type {Record<string, unknown>} */
	let data;

	try {
		data = raw ? JSON.parse(raw) : {};
	} catch {
		data = { error: 'Unexpected response from the messages API' };
	}

	if (!upstream.ok || data.error) {
		const status = upstream.status >= 400 ? upstream.status : 400;
		return json({ error: data.error ?? 'Unexpected response from the messages API' }, { status });
	}

	return json({
		count: Number(data.count ?? 0),
		messages: Array.isArray(data.messages) ? data.messages : []
	});
}

/**
 * Proxies POST /conversations/:id/messages from the Go API.
 * Body: { sender_type: 'doctor'|'patient', sender_id: string, message: string }
 *
 * server.go -> PostMessage requires all three fields; sender_id is the owning
 * doctor/patient id so the UI can render "who said what".
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ params, request, fetch }) {
	const { id } = params;

	if (!UUID_RE.test(id)) {
		return json({ error: 'Invalid conversation id' }, { status: 400 });
	}

	/** @type {unknown} */
	let body;

	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const b = /** @type {Record<string, unknown>} */ (body);

	const senderType = b.sender_type;
	const senderId = typeof b.sender_id === 'string' ? b.sender_id.trim() : '';
	const message = b.message;

	if (senderType !== 'doctor' && senderType !== 'patient') {
		return json({ error: 'sender_type must be "doctor" or "patient"' }, { status: 400 });
	}
	if (senderId === '') {
		return json({ error: 'sender_id is required' }, { status: 400 });
	}
	if (typeof message !== 'string' || message.trim() === '') {
		return json({ error: 'message (non-empty string) is required' }, { status: 400 });
	}

	/** @type {Response} */
	let upstream;

	try {
		upstream = await fetch(`${getApiBase()}/conversations/${id}/messages`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json' },
			body: JSON.stringify({
				sender_type: senderType,
				sender_id: senderId,
				message: message.trim()
			})
		});
	} catch (cause) {
		return json(
			{ error: 'Cannot reach the messages API', details: String(cause) },
			{ status: 502 }
		);
	}

	const raw = await upstream.text();

	/** @type {Record<string, unknown>} */
	let data;

	try {
		data = raw ? JSON.parse(raw) : {};
	} catch {
		data = { error: 'Unexpected response from the messages API' };
	}

	const failed = !upstream.ok || Boolean(data.error);
	const status = failed ? (upstream.status >= 400 ? upstream.status : 400) : 201;

	// Return the created message (or the full data) so the UI can append it.
	return json(data, { status });
}

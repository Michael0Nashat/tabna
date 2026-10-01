import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

const DEFAULT_API_BASE = 'https://goserverapi.vercel.app';

// Text fields accepted by the Go login endpoint (see server.go -> LoginDoctor).
const TEXT_FIELDS = ['full_name', 'email'];

/** @returns {string} */
function getApiBase() {
	const base = env.DOCTORS_API_URL || DEFAULT_API_BASE;
	return base.replace(/\/+$/, '');
}

/**
 * Proxies doctor login (POST /doctors/login) from the Go API.
 *
 * Same reason as the GET/POST in ../+server.js: the API ships no CORS headers,
 * so the browser cannot read it cross-origin. Going through the server keeps the
 * base URL private and gives us one place to normalise the response for the UI.
 *
 * This is a static segment, so SvelteKit matches `/api/doctors/login` here
 * instead of the sibling `/api/doctors/[id]` dynamic route.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request, fetch }) {
	/** @type {Record<string, unknown>} */
	let payload;

	try {
		payload = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	// Only the two text fields are forwarded. Anything else the client sends is
	// dropped rather than passed through to the API.
	/** @type {Record<string, string>} */
	const body = {};

	for (const field of TEXT_FIELDS) {
		const value = payload[field];
		if (typeof value === 'string') body[field] = value.trim();
	}

	if (!body.full_name || !body.email) {
		return json({ error: 'full_name and email are required' }, { status: 400 });
	}

	/** @type {Response} */
	let upstream;

	try {
		upstream = await fetch(`${getApiBase()}/doctors/login`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json'
			},
			body: JSON.stringify(body)
		});
	} catch (cause) {
		return json(
			{ error: 'Cannot reach the doctors API', details: String(cause) },
			{ status: 502 }
		);
	}

	const raw = await upstream.text();

	/** @type {Record<string, unknown>} */
	let data;

	try {
		data = raw ? JSON.parse(raw) : {};
	} catch {
		data = { error: 'Unexpected response from the doctors API' };
	}

	if (!upstream.ok || data.error) {
		const status = upstream.status >= 400 ? upstream.status : 400;
		return json({ error: data.error ?? 'Unexpected response from the doctors API' }, { status });
	}

	const record = data.doctor;
	/** @type {Record<string, unknown>} */
	const doctor =
		record && typeof record === 'object' && !Array.isArray(record)
			? /** @type {Record<string, unknown>} */ (record)
			: {};

	// Only the id is forwarded. The Go handler returns the same row as
	// GET /doctors/:id, whose large base64 image columns are never needed here —
	// the dashboard fetches the picture on its own once it knows the id.
	return json({ id: typeof doctor.id === 'string' ? doctor.id : '' });
}
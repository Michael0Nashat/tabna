import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

const DEFAULT_API_BASE = 'https://goserverapi.vercel.app';

/** @returns {string} */
function getApiBase() {
	const base = env.DOCTORS_API_URL || DEFAULT_API_BASE;
	return base.replace(/\/+$/, '');
}

/**
 * Proxies POST /patients/login from the Go API.
 * Body: { username: string, phone: string }
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request, fetch }) {
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
	const username = typeof b.username === 'string' ? b.username.trim() : '';
	const phone = typeof b.phone === 'string' ? b.phone.trim() : '';

	if (!username || !phone) {
		return json({ error: 'username and phone are required' }, { status: 400 });
	}

	/** @type {Response} */
	let upstream;

	try {
		upstream = await fetch(`${getApiBase()}/patients/login`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json' },
			body: JSON.stringify({ username, phone })
		});
	} catch (cause) {
		return json(
			{ error: 'Cannot reach the patients API', details: String(cause) },
			{ status: 502 }
		);
	}

	const raw = await upstream.text();

	/** @type {Record<string, unknown>} */
	let data;

	try {
		data = raw ? JSON.parse(raw) : {};
	} catch {
		data = { error: 'Unexpected response from the patients API' };
	}

	if (!upstream.ok || data.error) {
		const status = upstream.status >= 400 ? upstream.status : 400;
		return json({ error: data.error ?? 'Unexpected response from the patients API' }, { status });
	}

	const patient = data.patient;
	return json({
		id: typeof patient?.id === 'number' ? patient.id : null,
		username: typeof patient?.username === 'string' ? patient.username : '',
		phone: typeof patient?.phone === 'string' ? patient.phone : '',
		created_at: typeof patient?.created_at === 'string' ? patient.created_at : ''
	});
}
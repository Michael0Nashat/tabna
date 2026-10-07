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
 * Proxies PATCH /doctors/:id/status to the Go API.
 *
 * The Go handler (UpdateDoctorStatus in server.go) accepts:
 *   { "is_online": boolean }
 * and returns:
 *   { "is_online": boolean, "online_status": string }
 *
 * @type {import('./$types').RequestHandler}
 */
export async function PATCH({ params, request, fetch }) {
	const { id } = params;

	if (!UUID_RE.test(id)) {
		return json({ error: 'Invalid doctor id' }, { status: 400 });
	}

	/** @type {unknown} */
	let body;

	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	if (
		!body ||
		typeof body !== 'object' ||
		Array.isArray(body) ||
		typeof (/** @type {Record<string,unknown>} */ (body).is_online) !== 'boolean'
	) {
		return json({ error: 'is_online (boolean) is required' }, { status: 400 });
	}

	/** @type {Response} */
	let upstream;

	try {
		upstream = await fetch(`${getApiBase()}/doctors/${id}/status`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json', accept: 'application/json' },
			body: JSON.stringify({ is_online: /** @type {Record<string,unknown>} */ (body).is_online })
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

	return json({
		is_online: typeof data.is_online === 'boolean' ? data.is_online : false,
		online_status: typeof data.online_status === 'string' ? data.online_status : ''
	});
}

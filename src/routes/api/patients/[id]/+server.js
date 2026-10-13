import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

const DEFAULT_API_BASE = 'https://goserverapi.vercel.app';

/** @returns {string} */
function getApiBase() {
	const base = env.DOCTORS_API_URL || DEFAULT_API_BASE;
	return base.replace(/\/+$/, '');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Proxies GET /patients/:id from the Go API.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ params, fetch }) {
	const { id } = params;

	if (!UUID_RE.test(id)) {
		return json({ error: 'Invalid patient id' }, { status: 400 });
	}

	/** @type {Response} */
	let upstream;

	try {
		upstream = await fetch(`${getApiBase()}/patients/${id}`, {
			headers: { accept: 'application/json' }
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

	return json(data);
}

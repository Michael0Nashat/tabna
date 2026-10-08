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
 * GET /api/work-places/:id
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ params, fetch }) {
	const { id } = params;

	if (!UUID_RE.test(id)) {
		return json({ error: 'Invalid work place id' }, { status: 400 });
	}

	/** @type {Response} */
	let upstream;
	try {
		upstream = await fetch(`${getApiBase()}/work-places/${id}`, {
			headers: { accept: 'application/json' }
		});
	} catch (cause) {
		return json({ error: 'Cannot reach the API', details: String(cause) }, { status: 502 });
	}

	const raw = await upstream.text();
	/** @type {Record<string, unknown>} */
	let data;
	try {
		data = raw ? JSON.parse(raw) : {};
	} catch {
		data = { error: 'Unexpected response from the API' };
	}

	if (!upstream.ok || data.error) {
		const status = upstream.status >= 400 ? upstream.status : 400;
		return json({ error: data.error ?? 'Unexpected response from the API' }, { status });
	}

	return json(data);
}

/**
 * PUT /api/work-places/:id
 * Body: { place_type, name, address, phone?, exam_price? }
 * @type {import('./$types').RequestHandler}
 */
export async function PUT({ params, request, fetch }) {
	const { id } = params;

	if (!UUID_RE.test(id)) {
		return json({ error: 'Invalid work place id' }, { status: 400 });
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

	if (!b.place_type || !b.name || !b.address) {
		return json({ error: 'place_type, name and address are required' }, { status: 400 });
	}

	/** @type {Response} */
	let upstream;
	try {
		upstream = await fetch(`${getApiBase()}/work-places/${id}`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json', accept: 'application/json' },
			body: JSON.stringify(body)
		});
	} catch (cause) {
		return json({ error: 'Cannot reach the API', details: String(cause) }, { status: 502 });
	}

	const raw = await upstream.text();
	/** @type {Record<string, unknown>} */
	let data;
	try {
		data = raw ? JSON.parse(raw) : {};
	} catch {
		data = { error: 'Unexpected response from the API' };
	}

	const failed = !upstream.ok || Boolean(data.error);
	const status = failed ? (upstream.status >= 400 ? upstream.status : 400) : 200;

	return json(data, { status });
}

/**
 * DELETE /api/work-places/:id
 * @type {import('./$types').RequestHandler}
 */
export async function DELETE({ params, fetch }) {
	const { id } = params;

	if (!UUID_RE.test(id)) {
		return json({ error: 'Invalid work place id' }, { status: 400 });
	}

	/** @type {Response} */
	let upstream;
	try {
		upstream = await fetch(`${getApiBase()}/work-places/${id}`, {
			method: 'DELETE',
			headers: { accept: 'application/json' }
		});
	} catch (cause) {
		return json({ error: 'Cannot reach the API', details: String(cause) }, { status: 502 });
	}

	const raw = await upstream.text();
	/** @type {Record<string, unknown>} */
	let data;
	try {
		data = raw ? JSON.parse(raw) : {};
	} catch {
		data = { error: 'Unexpected response from the API' };
	}

	const failed = !upstream.ok || Boolean(data.error);
	const status = failed ? (upstream.status >= 400 ? upstream.status : 400) : 200;

	return json(data, { status });
}

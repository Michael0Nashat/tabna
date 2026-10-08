import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

const DEFAULT_API_BASE = 'https://goserverapi.vercel.app';

/** @returns {string} */
function getApiBase() {
	const base = env.DOCTORS_API_URL || DEFAULT_API_BASE;
	return base.replace(/\/+$/, '');
}

/**
 * GET /api/work-places?doctor_id=<uuid>
 * Returns all work places, optionally filtered by doctor.
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ url, fetch }) {
	const doctorId = url.searchParams.get('doctor_id') ?? '';
	const upstream_url = doctorId
		? `${getApiBase()}/work-places?doctor_id=${encodeURIComponent(doctorId)}`
		: `${getApiBase()}/work-places`;

	/** @type {Response} */
	let upstream;
	try {
		upstream = await fetch(upstream_url, { headers: { accept: 'application/json' } });
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

	return json({
		count: Number(data.count ?? 0),
		work_places: Array.isArray(data.work_places) ? data.work_places : []
	});
}

/**
 * POST /api/work-places
 * Body: { doctor_id, place_type, name, address, phone?, exam_price?, schedules? }
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

	if (!b.doctor_id || !b.place_type || !b.name || !b.address) {
		return json({ error: 'doctor_id, place_type, name and address are required' }, { status: 400 });
	}

	/** @type {Response} */
	let upstream;
	try {
		upstream = await fetch(`${getApiBase()}/work-places`, {
			method: 'POST',
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
	const status = failed ? (upstream.status >= 400 ? upstream.status : 400) : 201;

	return json(data, { status });
}

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
 * POST /api/work-places/:id/schedules
 *
 * Replaces ALL schedules for the given work place.
 * Body: { schedules: [ { day_of_week, is_off, from_time?, to_time? }, ... ] }
 *
 * day_of_week: 0=السبت, 1=الأحد, 2=الاثنين, 3=الثلاثاء, 4=الأربعاء, 5=الخميس, 6=الجمعة
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ params, request, fetch }) {
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

	if (!Array.isArray(b.schedules)) {
		return json({ error: 'schedules array is required' }, { status: 400 });
	}

	/** @type {Response} */
	let upstream;
	try {
		upstream = await fetch(`${getApiBase()}/work-places/${id}/schedules`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json' },
			body: JSON.stringify({ schedules: b.schedules })
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

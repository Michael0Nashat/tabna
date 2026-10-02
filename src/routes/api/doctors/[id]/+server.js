import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

const DEFAULT_API_BASE = 'https://goserverapi.vercel.app';

// `id` is interpolated into the upstream path, so accept only a real UUID.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** @returns {string} */
function getApiBase() {
	const base = env.DOCTORS_API_URL || DEFAULT_API_BASE;
	return base.replace(/\/+$/, '');
}

/**
 * Proxies a single doctor (GET /doctors/:id) from the Go API.
 *
 * The list endpoint deliberately omits `profile_image` (see GetDoctors in
 * server.go) to keep the response light, but the detail endpoint returns it as
 * a base64 data URL. The dashboard needs the picture, so it fetches the detail
 * for whichever doctor is being viewed.
 *
 * Only `profile_image` is forwarded: the other image columns are large base64
 * payloads the dashboard never renders, and this route is on the page's
 * critical path.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ params, fetch }) {
	const { id } = params;

	if (!UUID_RE.test(id)) {
		return json({ error: 'Invalid doctor id' }, { status: 400 });
	}

	/** @type {Response} */
	let upstream;

	try {
		upstream = await fetch(`${getApiBase()}/doctors/${id}`, {
			headers: { accept: 'application/json' }
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

	const body = data.doctor;
	/** @type {Record<string, unknown>} */
	const doctor =
		body && typeof body === 'object' && !Array.isArray(body)
			? /** @type {Record<string, unknown>} */ (body)
			: {};

	return json({
		id: typeof doctor.id === 'string' ? doctor.id : id,
		profile_image: typeof doctor.profile_image === 'string' ? doctor.profile_image : ''
	});
}
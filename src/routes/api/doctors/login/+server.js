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
 * Same normalisation as LoginDoctor in server.go: trim, then fold case, so a
 * hand-typed name or a mixed-case email still matches the stored row.
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalize(value) {
	return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Matches the credentials against the already-deployed GET /doctors list.
 *
 * POST /doctors/login only answers once server.go is redeployed; until then the
 * API replies with Vercel's plain-text 404. The list endpoint is already live
 * and carries the same two columns, so login degrades to matching there instead
 * of failing outright. This branch only runs while that route returns 404 — the
 * dedicated endpoint takes over by itself the moment it is deployed.
 *
 * @param {string} base
 * @param {string} fullName already normalised
 * @param {string} email already normalised
 * @param {typeof fetch} fetch
 * @returns {Promise<Response>}
 */
async function matchAgainstList(base, fullName, email, fetch) {
	/** @type {Response} */
	let upstream;

	try {
		upstream = await fetch(`${base}/doctors`, {
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
		return json({ error: 'Unexpected response from the doctors API' }, { status: 502 });
	}

	if (!upstream.ok || data.error) {
		const status = upstream.status >= 400 ? upstream.status : 400;
		return json({ error: data.error ?? 'Unexpected response from the doctors API' }, { status });
	}

	const rows = Array.isArray(data.doctors) ? data.doctors : [];

	const match = rows.find((row) => {
		if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
		const record = /** @type {Record<string, unknown>} */ (row);
		return normalize(record.full_name) === fullName && normalize(record.email) === email;
	});

	if (!match) {
		return json({ error: 'Invalid credentials' }, { status: 401 });
	}

	const id = /** @type {Record<string, unknown>} */ (match).id;

	return json({ id: typeof id === 'string' ? id : '' });
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

	const base = getApiBase();
	const fullName = normalize(body.full_name);
	const email = normalize(body.email);

	/** @type {Response} */
	let upstream;

	try {
		upstream = await fetch(`${base}/doctors/login`, {
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

	// The Go route isn't deployed yet, so the API answers 404 (Vercel's
	// plain-text body). Fall back rather than surfacing a misleading error.
	if (upstream.status === 404) {
		return matchAgainstList(base, fullName, email, fetch);
	}

	const raw = await upstream.text();

	// The Go API answers with JSON, but infrastructure errors can arrive as
	// text/plain or HTML. Report what actually came back instead of collapsing
	// every such failure into one opaque message.
	/** @type {Record<string, unknown>} */
	let data = {};

	if (raw.trim() !== '') {
		try {
			const parsed = JSON.parse(raw);

			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				data = parsed;
			}
		} catch {
			const status = upstream.status >= 400 ? upstream.status : 502;

			return json(
				{
					error: `Unexpected response from the doctors API (HTTP ${upstream.status})`,
					details: raw.slice(0, 500)
				},
				{ status }
			);
		}
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
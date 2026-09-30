import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

const DEFAULT_API_BASE = 'https://goserverapi.vercel.app';

// Text fields accepted by the Go API (see server.go -> CreateDoctor).
const TEXT_FIELDS = [
	'full_name',
	'phone',
	'email',
	'national_id',
	'medical_syndicate_id',
	'birth_date',
	'specialty',
	'professional_degree',
	'governorate'
];

// File fields accepted by the Go API.
const FILE_FIELDS = [
	'profile_image',
	'medical_syndicate_card',
	'national_id_card',
	'specialty_certificate'
];

/** @returns {string} */
function getApiBase() {
	const base = env.DOCTORS_API_URL || DEFAULT_API_BASE;
	return base.replace(/\/+$/, '');
}

/**
 * Proxies the doctors list from the Go API.
 *
 * Same reason as the POST below: the API ships no CORS headers, so the browser
 * cannot read it cross-origin. Going through the server keeps the base URL
 * private and lets us normalise the payload shape for the UI.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ fetch }) {
	/** @type {Response} */
	let upstream;

	try {
		upstream = await fetch(`${getApiBase()}/doctors`, {
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

	// Guarantee a stable shape so the page never has to defend against nulls.
	return json({
		count: Number(data.count ?? 0),
		doctors: Array.isArray(data.doctors) ? data.doctors : []
	});
}

/**
 * Proxies the doctor registration to the Go API.
 *
 * This exists because the Go API ships no CORS headers and does not answer the
 * OPTIONS preflight, so the browser cannot call it cross-origin directly.
 * Going through the server keeps the API base URL private and avoids preflights.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request, fetch }) {
	/** @type {FormData} */
	let incoming;

	try {
		incoming = await request.formData();
	} catch {
		return json({ error: 'Invalid multipart form' }, { status: 400 });
	}

	/** @type {FormData} */
	const payload = new FormData();

	for (const name of TEXT_FIELDS) {
		const value = incoming.get(name);
		if (typeof value === 'string' && value.trim() !== '') {
			payload.set(name, value.trim());
		}
	}

	for (const name of FILE_FIELDS) {
		const value = incoming.get(name);
		if (value instanceof File && value.size > 0) {
			payload.set(name, value, value.name);
		}
	}

	/** @type {Response} */
	let upstream;

	try {
		upstream = await fetch(`${getApiBase()}/doctors`, {
			method: 'POST',
			body: payload
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

	// server.go answers most validation failures with HTTP 200 and an `error`
	// field in the body, so normalise those into a real failure status here.
	const failed = !upstream.ok || Boolean(data.error);
	const status = failed ? (upstream.status >= 400 ? upstream.status : 400) : 200;

	return json(data, { status });
}
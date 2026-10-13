import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

const DEFAULT_API_BASE = 'https://goserverapi.vercel.app';

/** @returns {string} */
function getApiBase() {
	const base = env.DOCTORS_API_URL || DEFAULT_API_BASE;
	return base.replace(/\/+$/, '');
}

/**
 * Proxies GET /conversations from the Go API.
 * Supports ?doctor_id=<uuid> query param to filter by doctor.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ url, fetch }) {
	const doctorId = url.searchParams.get('doctor_id') ?? '';
	const upstream_url = doctorId
		? `${getApiBase()}/conversations?doctor_id=${encodeURIComponent(doctorId)}`
		: `${getApiBase()}/conversations`;

	/** @type {Response} */
	let upstream;

	try {
		upstream = await fetch(upstream_url, {
			headers: { accept: 'application/json' }
		});
	} catch (cause) {
		return json(
			{ error: 'Cannot reach the conversations API', details: String(cause) },
			{ status: 502 }
		);
	}

	const raw = await upstream.text();

	/** @type {Record<string, unknown>} */
	let data;

	try {
		data = raw ? JSON.parse(raw) : {};
	} catch {
		data = { error: 'Unexpected response from the conversations API' };
	}

	if (!upstream.ok || data.error) {
		const status = upstream.status >= 400 ? upstream.status : 400;
		return json({ error: data.error ?? 'Unexpected response from the conversations API' }, { status });
	}

	return json({
		count: Number(data.count ?? 0),
		conversations: Array.isArray(data.conversations) ? data.conversations : []
	});
}

/**
 * Proxies POST /conversations to the Go API.
 *
 * The Go backend creates a conversation when a patient or doctor initiates a
 * chat. The SvelteKit route forwards the JSON body:
 *   { "patient_id": 1, "doctor_id": "<uuid>" }
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request, fetch }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const upstream_url = `${getApiBase()}/conversations`;

	/** @type {Response} */
	let upstream;
	try {
		upstream = await fetch(upstream_url, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json'
			},
			body: JSON.stringify(body)
		});
	} catch (cause) {
		return json(
			{ error: 'Cannot reach the conversations API', details: String(cause) },
			{ status: 502 }
		);
	}

	const raw = await upstream.text();
	/** @type {Record<string, unknown>} */
	let data;
	try {
		data = raw ? JSON.parse(raw) : {};
	} catch {
		data = { error: 'Unexpected response from the conversations API' };
	}

	if (!upstream.ok || data.error) {
		const status = upstream.status >= 400 ? upstream.status : 400;
		return json({ error: data.error ?? 'Unexpected response from the conversations API' }, { status });
	}

	// The Go API returns the created conversation row directly.
	return json(data, { status: upstream.status || 201 });
}
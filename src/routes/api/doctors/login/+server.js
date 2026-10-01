import { json } from '@sveltejs/kit';
import {
	MAX_PASSWORD_LENGTH,
	setSessionCookie
} from '$lib/server/session.js';
import {
	callUpstream,
	clientKey,
	isSameOrigin,
	MAX_JSON_BODY_BYTES,
	rateLimit
} from '$lib/server/upstream.js';

// The Go API hashes this itself, so the proxy only checks the shape of what the
// browser sends before the credentials are forwarded.
const TEXT_FIELDS = ['full_name', 'email', 'password'];

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

/**
 * Signs a doctor in (POST /doctors/login).
 *
 * The Go API owns the credentials and hashes the password; the proxy only
 * validates the shape of the request and then mints the session cookie. The
 * browser never receives a token it could read or leak — only an httpOnly cookie.
 *
 * There is deliberately no fallback that matches the credentials against the
 * doctor list. That list carries the name and email of every doctor, so matching
 * against it would hand a valid session to anyone who can read it.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request, cookies, fetch }) {
	if (!isSameOrigin(request)) {
		return json({ error: 'Invalid request origin' }, { status: 403 });
	}

	const declaredLength = Number(request.headers.get('content-length') ?? 0);
	if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
		return json({ error: 'Request body too large' }, { status: 413 });
	}

	// Charged before the password is examined, so guessing is not free.
	const limit = rateLimit(clientKey(request, 'login'), LOGIN_LIMIT, LOGIN_WINDOW_MS);
	if (!limit.allowed) {
		return json(
			{ error: 'Too many attempts. Please try again later.' },
			{ status: 429, headers: { 'retry-after': String(limit.retryAfter) } }
		);
	}

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

	// Only the three known fields are forwarded. Anything else the client sends
	// is dropped rather than passed through to the API.
	/** @type {Record<string, string>} */
	const body = {};

	for (const field of TEXT_FIELDS) {
		const value = payload[field];
		if (typeof value === 'string') body[field] = value.trim();
	}

	if (!body.full_name || !body.email || !body.password) {
		return json(
			{ error: 'full_name, email and password are required' },
			{ status: 400 }
		);
	}

	if (body.password.length > MAX_PASSWORD_LENGTH) {
		return json({ error: 'Invalid credentials' }, { status: 401 });
	}

	const result = await callUpstream('/doctors/login', {
		fetch,
		method: 'POST',
		body: JSON.stringify(body)
	});

	if (!result.ok) {
		// The upstream message can name columns and rows, so it is not forwarded.
		// Bad credentials collapse into one generic 401, which also avoids telling
		// an attacker whether the name exists.
		if (result.status === 401 || result.status === 403) {
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		return json({ error: 'Login failed' }, { status: result.status });
	}

	const doctor =
		result.data.doctor &&
		typeof result.data.doctor === 'object' &&
		!Array.isArray(result.data.doctor)
			? /** @type {Record<string, unknown>} */ (result.data.doctor)
			: {};

	const id = typeof doctor.id === 'string' ? doctor.id : '';

	if (!id) {
		return json({ error: 'Login failed' }, { status: 401 });
	}

	await setSessionCookie(cookies, id);

	return json({ ok: true });
}
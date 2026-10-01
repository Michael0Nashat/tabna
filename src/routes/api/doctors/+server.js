import { json } from '@sveltejs/kit';
import { getSessionDoctorId, hashPassword, MIN_PASSWORD_LENGTH } from '$lib/server/session.js';
import {
	callUpstream,
	clientKey,
	isSameOrigin,
	MAX_JSON_BODY_BYTES,
	rateLimit
} from '$lib/server/upstream.js';

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

// Mirrors MaxImageSize / MaxFileSize in server.go. Checked here too so an
// oversized body is refused before it is buffered and forwarded.
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_DOC_SIZE = 10 * 1024 * 1024;

const MAX_JSON_BODY_BYTES_ = MAX_JSON_BODY_BYTES;

const REGISTER_LIMIT = 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

/** Fields the browser is allowed to see. `national_id` is deliberately absent. */
const PUBLIC_FIELDS = [
	'id',
	'full_name',
	'phone',
	'email',
	'medical_syndicate_id',
	'birth_date',
	'specialty',
	'professional_degree',
	'governorate',
	'created_at'
];

/**
 * Returns the signed-in doctor's own record (GET /api/doctors).
 *
 * This used to proxy the full public list, which exposed the national id, phone
 * and email of every doctor to anyone who asked. It now resolves the id from the
 * session cookie and returns only that one row, with the sensitive columns
 * stripped. Identity never comes from a query parameter.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ cookies, fetch }) {
	const id = await getSessionDoctorId(cookies);

	if (!id) {
		return json({ error: 'Authentication required' }, { status: 401 });
	}

	const result = await callUpstream(`/doctors/${id}`, { fetch });

	if (!result.ok) {
		return json(
			{ error: result.data.error ?? 'Unable to load the doctor profile' },
			{ status: result.status }
		);
	}

	const doctor =
		result.data.doctor &&
		typeof result.data.doctor === 'object' &&
		!Array.isArray(result.data.doctor)
			? /** @type {Record<string, unknown>} */ (result.data.doctor)
			: {};

	// Allow-list, not deny-list: a column added upstream later is not exposed
	// until it is deliberately included here.
	/** @type {Record<string, unknown>} */
	const safe = {};

	for (const field of PUBLIC_FIELDS) {
		if (typeof doctor[field] === 'string') safe[field] = doctor[field];
	}

	safe.id = id;

	// Shape kept as a list so the dashboard keeps its existing contract.
	return json({ count: 1, doctors: [safe] });
}

/**
 * Registers a doctor (POST /api/doctors).
 *
 * Registration is deliberately public, so it is rate limited: each accepted
 * request stores several megabytes of base64 in Postgres, and unlimited
 * submissions would fill the database.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request, fetch }) {
	if (!isSameOrigin(request)) {
		return json({ error: 'Invalid request origin' }, { status: 403 });
	}

	const limit = rateLimit(clientKey(request, 'register'), REGISTER_LIMIT, REGISTER_WINDOW_MS);
	if (!limit.allowed) {
		return json(
			{ error: 'Too many registration attempts. Please try again later.' },
			{ status: 429, headers: { 'retry-after': String(limit.retryAfter) } }
		);
	}

	/** @type {FormData} */
	let incoming;

	try {
		incoming = await request.formData();
	} catch {
		return json({ error: 'Invalid multipart form' }, { status: 400 });
	}

	const password = typeof incoming.get('password') === 'string' ? String(incoming.get('password')) : '';

	if (password.length < MIN_PASSWORD_LENGTH) {
		return json(
			{ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` },
			{ status: 400 }
		);
	}

	if (password.length > 200) {
		return json({ error: 'password is too long' }, { status: 400 });
	}

	/** @type {FormData} */
	const payload = new FormData();

	for (const name of TEXT_FIELDS) {
		const value = incoming.get(name);
		if (typeof value === 'string' && value.trim() !== '') {
			payload.set(name, value.trim());
		}
	}

	// The API stores a hash, never the password itself.
	payload.set('password_hash', await hashPassword(password));

	for (const name of FILE_FIELDS) {
		const value = incoming.get(name);
		if (!(value instanceof File) || value.size === 0) continue;

		const maxSize = name === 'profile_image' ? MAX_IMAGE_SIZE : MAX_DOC_SIZE;

		// `type` is only a hint from the browser; the Go API sniffs the bytes.
		// The size check here is what keeps an oversized body from being buffered
		// and forwarded in the first place.
		if (value.size > maxSize) {
			return json(
				{ error: `${name} exceeds maximum file size` },
				{ status: 400 }
			);
		}

		payload.set(name, value, value.name);
	}

	const result = await callUpstream('/doctors', { fetch, method: 'POST', body: payload });

	if (!result.ok) {
		// Validation messages from the API are field names the UI already knows
		// how to translate; driver and constraint text is not forwarded.
		return json(
			{ error: result.data.error ?? 'Failed to create doctor' },
			{ status: result.status }
		);
	}

	return json({ message: 'Doctor registered successfully' }, { status: 201 });
}
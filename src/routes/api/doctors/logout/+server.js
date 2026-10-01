import { json } from '@sveltejs/kit';
import { clearSessionCookie } from '$lib/server/session.js';
import { isSameOrigin } from '$lib/server/upstream.js';

/**
 * Ends the doctor session (POST /api/doctors/logout).
 *
 * Only clears the cookie. Anything the session authorised upstream is revoked
 * there, not here.
 *
 * @type {import('./$types').RequestHandler}
 */
export function POST({ cookies, request }) {
	if (!isSameOrigin(request)) {
		return json({ error: 'Invalid request origin' }, { status: 403 });
	}

	clearSessionCookie(cookies);

	return json({ ok: true });
}
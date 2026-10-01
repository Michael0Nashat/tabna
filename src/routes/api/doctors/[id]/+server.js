import { json } from '@sveltejs/kit';
import { getSessionDoctorId } from '$lib/server/session.js';
import { callUpstream } from '$lib/server/upstream.js';

// `id` is interpolated into the upstream path, so accept only a real UUID.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns one doctor's picture (GET /api/doctors/[id]).
 *
 * The id in the path is checked against the session: a signed-in doctor can only
 * read their own record, so a leaked or guessed UUID cannot be used to pull
 * another doctor's identity documents out of the API.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ params, cookies, fetch }) {
	const { id } = params;

	if (!UUID_RE.test(id)) {
		return json({ error: 'Invalid doctor id' }, { status: 400 });
	}

	const sessionId = await getSessionDoctorId(cookies);

	if (!sessionId) {
		return json({ error: 'Authentication required' }, { status: 401 });
	}

	if (sessionId !== id) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const result = await callUpstream(`/doctors/${id}`, { fetch });

	if (!result.ok) {
		return json(
			{ error: result.data.error ?? 'Unable to load the doctor profile' },
			{ status: result.status }
		);
	}

	const body = result.data.doctor;
	/** @type {Record<string, unknown>} */
	const doctor =
		body && typeof body === 'object' && !Array.isArray(body)
			? /** @type {Record<string, unknown>} */ (body)
			: {};

	// Only the picture crosses this boundary. The other image columns are large
	// base64 identity documents the dashboard never renders.
	const profileImage = typeof doctor.profile_image === 'string' ? doctor.profile_image : '';

	return json({
		id,
		// The Go API builds this as `data:<type>;base64,...`. Anything that is
		// not a data URL is dropped rather than passed to an `src` attribute.
		profile_image: /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]*$/.test(profileImage)
			? profileImage
			: ''
	});
}
import { redirect } from '@sveltejs/kit';
import { getSessionDoctorId } from '$lib/server/session.js';

/**
 * Guards the doctor dashboard.
 *
 * The page used to read the doctor id from `?id=<uuid>` in the query string, so
 * anyone could open anyone's dashboard by editing the URL. Identity now comes
 * from the signed session cookie only; an unsigned visit is redirected to the
 * sign-in page.
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load({ cookies }) {
	const doctorId = await getSessionDoctorId(cookies);

	if (!doctorId) {
		redirect(303, '/');
	}

	return { doctorId };
}
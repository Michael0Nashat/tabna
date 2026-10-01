/**
 * Security headers applied to every response.
 *
 * The dashboard shows a doctor's personal and professional details, and until
 * now the app sent no framing or sniffing policy at all — which left it
 * framable and let a browser second-guess the type of a response.
 *
 * The Content-Security-Policy is configured in vite.config.js, because SvelteKit
 * has to attach its own hashes/nonces to the inline bootstrap scripts.
 */

/** @type {Record<string, string>} */
const SECURITY_HEADERS = {
	// Belt-and-braces with `frame-ancestors` in the CSP, which covers modern
	// browsers; this one is what older browsers understand.
	'x-frame-options': 'DENY',
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
	'cross-origin-opener-policy': 'same-origin',
	// Only meaningful over TLS, and only safe to assert once the app is actually
	// served over it — asserting it in plain HTTP would pin visitors to a broken
	// scheme for the max-age below.
	'strict-transport-security': 'max-age=31536000; includeSubDomains'
};

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	const response = await resolve(event);

	for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(header, value);
	}

	// The dashboard and the session-bearing API must never sit in a shared or
	// browser cache, or one doctor could be served another's page.
	const path = event.url.pathname;
	if (path.startsWith('/api/') || path.startsWith('/doctor-dashboard')) {
		response.headers.set('cache-control', 'private, no-store, max-age=0');
		response.headers.append('vary', 'cookie');
	}

	return response;
}
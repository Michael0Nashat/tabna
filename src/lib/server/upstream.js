/**
 * Access to the Go doctors API.
 *
 * The API is reachable directly from the internet, so it is treated as an
 * untrusted upstream:
 *
 *  - every call carries the shared API key, so the API can refuse traffic that
 *    did not come through this server;
 *  - no internal error text is ever forwarded to the browser — the thrown
 *    errors carry upstream URLs and platform internals;
 *  - responses are normalised into `{ ok, status, data }` before they reach a
 *    route handler.
 *
 * Server-only: `$lib/server/*` is never bundled for the browser.
 */
import { env } from '$env/dynamic/private';

const DEFAULT_API_BASE = 'https://goserverapi.vercel.app';

/** Login and registration bodies are tiny; anything larger is a mistake. */
export const MAX_JSON_BODY_BYTES = 4096;

/**
 * Resolves the upstream base URL.
 *
 * @returns {string}
 */
export function getApiBase() {
	const base = String(env.DOCTORS_API_URL || DEFAULT_API_BASE).trim();

	// The base URL reaches an outbound fetch, so refuse anything that is not
	// plain https — a misconfigured value must not downgrade to cleartext or
	// turn the proxy into an open relay for odd schemes.
	if (!/^https:\/\/[^\s/]+/i.test(base)) {
		throw new Error('DOCTORS_API_URL must be an https:// URL');
	}

	return base.replace(/\/+$/, '');
}

/**
 * Performs one upstream call and normalises the result.
 *
 * @param {string} path path below the API base, e.g. `/doctors/login`
 * @param {{ fetch: typeof globalThis.fetch, method?: string, body?: BodyInit, headers?: Record<string, string> }} options
 * @returns {Promise<{ ok: boolean, status: number, data: Record<string, unknown> }>}
 */
export async function callUpstream(path, { fetch, method = 'GET', body, headers = {} }) {
	const outgoing = new Headers(headers);
	outgoing.set('accept', 'application/json');

	const apiKey = env.DOCTORS_API_KEY;
	if (apiKey) outgoing.set('x-api-key', String(apiKey));

	if (body !== undefined && !outgoing.has('content-type')) {
		outgoing.set('content-type', 'application/json');
	}

	/** @type {Response} */
	let response;

	try {
		response = await fetch(`${getApiBase()}${path}`, { method, body, headers: outgoing });
	} catch (cause) {
		// Logged, not returned: the message contains the upstream URL and the
		// platform's internal error shape.
		console.error('[upstream] request failed', { path, cause: String(cause) });
		return { ok: false, status: 502, data: { error: 'Cannot reach the doctors API' } };
	}

	const raw = await response.text();

	/** @type {Record<string, unknown>} */
	let data = {};

	if (raw.trim() !== '') {
		try {
			const parsed = JSON.parse(raw);

			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
				throw new Error('not a JSON object');
			}

			data = parsed;
		} catch {
			// Infrastructure errors arrive as text/plain or HTML.
			return {
				ok: false,
				status: response.status >= 400 ? response.status : 502,
				data: { error: `Unexpected response from the doctors API (HTTP ${response.status})` }
			};
		}
	}

	// server.go answers most validation failures with HTTP 200 plus an `error`
	// field, so treat that as a failure and give it a real status.
	const ok = response.ok && !data.error;
	const status = ok ? 200 : response.status >= 400 ? response.status : 400;

	return { ok, status, data };
}

/**
 * Rejects a state-changing request that did not originate from this site.
 *
 * Browsers always send `Origin` on cross-site POSTs; clients such as curl do
 * not send it at all, so its absence is not treated as suspicious.
 *
 * @param {Request} request
 * @returns {boolean}
 */
export function isSameOrigin(request) {
	const origin = request.headers.get('origin');
	if (!origin) return true;

	try {
		return origin === new URL(request.url).origin;
	} catch {
		return false;
	}
}

/** @type {Map<string, { count: number, resetAt: number }>} */
const attempts = new Map();
let lastSweep = 0;

/**
 * Fixed-window rate limiter, keyed by the caller.
 *
 * In-memory by design: it needs no new dependency and is enough to blunt
 * password guessing and registration spam on a single instance. A multi-instance
 * deployment needs a shared limiter in front of the app.
 *
 * @param {string} key
 * @param {number} limit attempts allowed per window
 * @param {number} windowMs
 * @returns {{ allowed: boolean, retryAfter: number }}
 */
export function rateLimit(key, limit, windowMs) {
	const now = Date.now();

	// Amortised sweep so the map cannot grow without bound.
	if (now - lastSweep > windowMs) {
		lastSweep = now;
		for (const [entryKey, entry] of attempts) {
			if (entry.resetAt <= now) attempts.delete(entryKey);
		}
	}

	const entry = attempts.get(key);

	if (!entry || entry.resetAt <= now) {
		attempts.set(key, { count: 1, resetAt: now + windowMs });
		return { allowed: true, retryAfter: 0 };
	}

	entry.count += 1;

	if (entry.count > limit) {
		return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
	}

	return { allowed: true, retryAfter: 0 };
}

/**
 * Builds a rate-limit key for the calling client.
 *
 * @param {Request} request
 * @param {string} scope keeps unrelated limiters in separate buckets
 * @returns {string}
 */
export function clientKey(request, scope) {
	const forwarded = request.headers.get('x-forwarded-for');
	const ip = forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip');

	return `${scope}:${ip?.trim() || 'unknown'}`;
}

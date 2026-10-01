/**
 * Doctor session handling.
 *
 * The session lives in an httpOnly cookie so page scripts can never read it and
 * an injected script cannot exfiltrate it. The Go API owns the credentials and
 * answers "which doctor signed in"; this module turns that id into a signed,
 * expiring token.
 *
 * Passwords are hashed with PBKDF2-HMAC-SHA256 (NIST SP 800-132) at the OWASP
 * work factor. The iteration count travels inside the stored record, so the
 * factor can be raised later without invalidating existing passwords.
 *
 * Server-only: `$lib/server/*` is never bundled for the browser.
 */
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

export const SESSION_COOKIE = 'doctor_session';

/** Sessions expire after 8 hours. */
const SESSION_TTL_SECONDS = 60 * 60 * 8;

const PBKDF2_ALGORITHM = 'pbkdf2_sha256';
const PBKDF2_ITERATIONS = 210_000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_KEY_BITS = 256;

/** Shortest password the registration endpoint accepts. */
export const MIN_PASSWORD_LENGTH = 8;

/** Longer passwords are truncated by the hash anyway; this caps the work. */
export const MAX_PASSWORD_LENGTH = 200;

/** Used only when SESSION_SECRET is unset. Assigned once per process. */
let fallbackSecret = null;
let warnedAboutSecret = false;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Web Crypto, resolved at call time.
 *
 * Deliberately not `node:crypto`: this module only needs primitives that exist
 * in every SvelteKit runtime, so it keeps working on edge adapters and needs
 * no `@types/node` for the type check to pass.
 */
function webCrypto() {
	if (!globalThis.crypto?.subtle) {
		throw new Error('Web Crypto is not available in this runtime');
	}

	return globalThis.crypto;
}

/**
 * @param {number} length
 * @returns {Uint8Array<ArrayBuffer>}
 */
function randomBytes(length) {
	return webCrypto().getRandomValues(new Uint8Array(length));
}

/** @param {Uint8Array} bytes */
function toHex(bytes) {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** @param {Uint8Array} bytes */
function toBase64(bytes) {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

/** @param {Uint8Array} bytes */
function toBase64Url(bytes) {
	return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * @param {string} value
 * @returns {Uint8Array<ArrayBuffer> | null} null when the input is not valid base64
 */
function fromBase64Url(value) {
	const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
	const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);

	try {
		const binary = atob(padded);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
		return bytes;
	} catch {
		return null;
	}
}

/**
 * Compares two byte arrays without leaking where they first differ.
 *
 * The running time depends only on the length, never on the contents, so an
 * attacker cannot learn a MAC or a password hash one byte at a time.
 *
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @returns {boolean}
 */
function timingSafeEqual(a, b) {
	if (a.length !== b.length) return false;

	let diff = 0;
	for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];

	return diff === 0;
}

/**
 * The HMAC key for session tokens. `SESSION_SECRET` must be set in every real
 * deployment. Without it a random per-process key is used so that a missing
 * secret fails *closed* — tokens become unguessable rather than forgeable, and
 * simply stop surviving a restart.
 *
 * @returns {string}
 */
function sessionSecret() {
	const configured = env.SESSION_SECRET;

	if (typeof configured === 'string' && configured.length >= 32) {
		return configured;
	}

	if (!warnedAboutSecret) {
		warnedAboutSecret = true;
		console.warn(
			'[auth] SESSION_SECRET is unset or shorter than 32 chars. Using a random per-process key: sessions will not survive a restart. Set SESSION_SECRET before deploying.'
		);
	}

	fallbackSecret ??= toHex(randomBytes(32));
	return fallbackSecret;
}

/** @returns {Promise<CryptoKey>} */
async function hmacKey() {
	return webCrypto().subtle.importKey(
		'raw',
		encoder.encode(sessionSecret()),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
}

/**
 * @param {string} password
 * @param {BufferSource} salt
 * @param {number} iterations
 * @param {number} bits
 * @returns {Promise<Uint8Array>}
 */
async function pbkdf2(password, salt, iterations, bits) {
	const key = await webCrypto().subtle.importKey(
		'raw',
		encoder.encode(password),
		'PBKDF2',
		false,
		['deriveBits']
	);

	const derived = await webCrypto().subtle.deriveBits(
		{ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
		key,
		bits
	);

	return new Uint8Array(derived);
}

/**
 * Hashes a password for storage.
 *
 * @param {string} password
 * @returns {Promise<string>} `pbkdf2_sha256$<iterations>$<salt>$<hash>`
 */
export async function hashPassword(password) {
	const salt = randomBytes(PBKDF2_SALT_BYTES);
	const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_BITS);

	return [PBKDF2_ALGORITHM, PBKDF2_ITERATIONS, toBase64(salt), toBase64(hash)].join('$');
}

/**
 * Verifies a password against a stored record in constant time.
 *
 * Returns false — never throws — for a malformed record, so a corrupt row can
 * never authenticate and never turns into a 500.
 *
 * @param {string} password
 * @param {string} stored
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, stored) {
	if (typeof password !== 'string' || typeof stored !== 'string') return false;

	const [algorithm, iterationsRaw, saltRaw, hashRaw] = stored.split('$');

	if (algorithm !== PBKDF2_ALGORITHM) return false;

	const iterations = Number.parseInt(iterationsRaw, 10);
	if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 10_000_000) {
		return false;
	}

	const expected = fromBase64Url(hashRaw);
	const salt = fromBase64Url(saltRaw);

	if (!expected || !salt || expected.length === 0) return false;

	try {
		const actual = await pbkdf2(password, salt, iterations, expected.length * 8);
		return timingSafeEqual(expected, actual);
	} catch {
		return false;
	}
}

/**
 * @param {string} payload
 * @returns {Promise<string>}
 */
async function sign(payload) {
	const signature = await webCrypto().subtle.sign(
		'HMAC',
		await hmacKey(),
		encoder.encode(payload)
	);

	return toBase64Url(new Uint8Array(signature));
}

/**
 * Mints a signed session token for a doctor id.
 *
 * @param {string} doctorId
 * @returns {Promise<string>}
 */
export async function createSessionToken(doctorId) {
	const claims = JSON.stringify({
		sub: doctorId,
		exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
	});

	const payload = toBase64Url(encoder.encode(claims));

	return `${payload}.${await sign(payload)}`;
}

/**
 * Verifies a token and returns the doctor id, or null if it is malformed,
 * forged, or expired.
 *
 * @param {string | undefined | null} token
 * @returns {Promise<string | null>}
 */
export async function readSessionToken(token) {
	if (typeof token !== 'string') return null;

	const separator = token.indexOf('.');
	if (separator <= 0) return null;

	const payload = token.slice(0, separator);
	const provided = fromBase64Url(token.slice(separator + 1));
	const expected = fromBase64Url(await sign(payload));

	// A null means the token or the signature is not even valid base64.
	if (!provided || !expected || !timingSafeEqual(provided, expected)) return null;

	const encodedClaims = fromBase64Url(payload);
	if (!encodedClaims) return null;

	try {
		const claims = JSON.parse(decoder.decode(encodedClaims));

		if (typeof claims?.sub !== 'string' || claims.sub === '') return null;
		if (typeof claims?.exp !== 'number' || claims.exp * 1000 <= Date.now()) return null;

		return claims.sub;
	} catch {
		return null;
	}
}

/**
 * Reads the signed-in doctor id from the session cookie.
 *
 * @param {import('@sveltejs/kit').Cookies} cookies
 * @returns {Promise<string | null>}
 */
export async function getSessionDoctorId(cookies) {
	return readSessionToken(cookies.get(SESSION_COOKIE));
}

/**
 * Starts a session by writing the httpOnly cookie.
 *
 * @param {import('@sveltejs/kit').Cookies} cookies
 * @param {string} doctorId
 */
export async function setSessionCookie(cookies, doctorId) {
	cookies.set(SESSION_COOKIE, await createSessionToken(doctorId), {
		path: '/',
		httpOnly: true,
		// `lax` still sends the cookie on top-level navigations, so the dashboard
		// survives a refresh, while blocking cross-site POSTs.
		sameSite: 'lax',
		secure: !dev,
		maxAge: SESSION_TTL_SECONDS
	});
}

/**
 * Ends the session.
 *
 * @param {import('@sveltejs/kit').Cookies} cookies
 */
export function clearSessionCookie(cookies) {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

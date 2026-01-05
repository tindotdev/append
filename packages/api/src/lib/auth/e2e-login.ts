/**
 * E2E Auth Bootstrap Endpoint (ADR 0019)
 *
 * Non-production endpoint for Playwright E2E tests to obtain authenticated
 * session without automating Google OAuth UI.
 *
 * POST /auth/e2e/login
 * - Requires x-e2e-secret header (constant-time comparison)
 * - Only enabled when APP_ENV !== 'production'
 * - Creates session for configured E2E_AUTH_EMAIL
 * - Returns 204 with session cookie
 *
 * Security notes:
 * - Rate limiting is not implemented as this endpoint is only available in
 *   non-production environments and requires a secret. Constant-time comparison
 *   prevents timing attacks. If abuse becomes a concern in preview, consider
 *   Cloudflare's built-in rate limiting or Durable Objects for state tracking.
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../platform/bindings';
import type { Auth } from './index';

type E2EVariables = Variables & {
	auth: Auth;
};

const e2eLoginRoute = new Hono<{ Bindings: Bindings; Variables: E2EVariables }>();

/**
 * Constant-time string comparison to prevent timing attacks.
 * Uses Web Crypto API's HMAC-based comparison with identical work in all paths.
 *
 * Security: Both length-mismatch and length-match paths perform identical
 * cryptographic operations (1 key import + 2 HMAC signs + byte comparison)
 * to prevent timing side-channels.
 */
async function secureCompare(a: string, b: string): Promise<boolean> {
	const encoder = new TextEncoder();
	const aBytes = encoder.encode(a);
	const bBytes = encoder.encode(b);

	// Always use 'a' as the key material to ensure consistent key derivation time
	const key = await crypto.subtle.importKey('raw', aBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

	// Always compute both signatures to ensure identical timing
	const sigA = await crypto.subtle.sign('HMAC', key, aBytes);
	const sigB = await crypto.subtle.sign('HMAC', key, bBytes);

	// Compare signatures in constant time
	const arrA = new Uint8Array(sigA);
	const arrB = new Uint8Array(sigB);

	// Length check (signatures are always same length from HMAC-SHA256)
	// but include length mismatch tracking for robustness
	const lengthMatch = a.length === b.length;

	// Constant-time byte comparison of signatures
	let sigMatch = true;
	for (let i = 0; i < arrA.length; i++) {
		sigMatch = sigMatch && arrA[i] === arrB[i];
	}

	// Both conditions must be true: original lengths match AND signatures match
	return lengthMatch && sigMatch;
}

/** Valid APP_ENV values */
const VALID_APP_ENVS = ['production', 'preview', 'local', 'test'] as const;

/** Session max age in seconds (7 days) */
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/** Minimum secret length (32+ random bytes recommended in docs) */
const MIN_SECRET_LENGTH = 32;

/** Basic email format regex (RFC 5321 simplified) */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Check if an email matches an allowlist pattern.
 * Supports wildcard pattern for plus-addressing: `prefix+*@domain`
 * Examples:
 *   - `e2e-bot+*@append.test` matches `e2e-bot+pr-123@append.test`
 *   - `test@example.com` matches `test@example.com` (exact match)
 *
 * This enables per-environment E2E email isolation (e.g., `e2e-bot+pr-{PR_NUMBER}@append.test`)
 * while maintaining a single allowlist pattern in the configuration.
 */
function emailMatchesAllowlist(email: string, allowlistPattern: string): boolean {
	const emailLower = email.toLowerCase();
	const patternLower = allowlistPattern.toLowerCase();

	// Check for wildcard pattern: prefix+*@domain
	if (patternLower.includes('+*@')) {
		const [prefix, domain] = patternLower.split('+*@');
		// Email must start with "prefix+" and end with "@domain"
		return emailLower.startsWith(prefix + '+') && emailLower.endsWith('@' + domain);
	}

	// Exact match fallback
	return emailLower === patternLower;
}

e2eLoginRoute.post('/login', async (c) => {
	const env = c.env;

	// Guard 1: APP_ENV validation + production check → 404 (pretend endpoint doesn't exist)
	if (!VALID_APP_ENVS.includes(env.APP_ENV as (typeof VALID_APP_ENVS)[number])) {
		console.warn('[E2E Auth] Invalid APP_ENV:', env.APP_ENV);
		return c.notFound();
	}
	if (env.APP_ENV === 'production') {
		return c.notFound();
	}

	// Guard 2: Required configuration → 404 (pretend endpoint doesn't exist)
	if (!env.E2E_AUTH_SECRET || !env.E2E_AUTH_EMAIL) {
		console.warn('[E2E Auth] Missing E2E_AUTH_SECRET or E2E_AUTH_EMAIL configuration');
		return c.notFound();
	}

	// Guard 2b: Secret length validation → 404 (misconfigured)
	if (env.E2E_AUTH_SECRET.length < MIN_SECRET_LENGTH) {
		console.warn(`[E2E Auth] E2E_AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
		return c.notFound();
	}

	// Guard 2c: Email format validation → 404 (misconfigured)
	const trimmedEmail = env.E2E_AUTH_EMAIL.trim();
	if (!EMAIL_REGEX.test(trimmedEmail)) {
		console.warn('[E2E Auth] E2E_AUTH_EMAIL is not a valid email format');
		return c.notFound();
	}

	// Guard 3: Secret header validation (constant-time) → 403
	const providedSecret = c.req.header('x-e2e-secret');
	if (!providedSecret || !(await secureCompare(providedSecret, env.E2E_AUTH_SECRET))) {
		console.warn('[E2E Auth] Invalid or missing x-e2e-secret header');
		return c.text('Forbidden', 403);
	}

	// Guard 4: Allowlist validation → 403
	// ADR 0019: endpoint must not mint sessions unless the E2E email is explicitly allowlisted.
	// Supports wildcard pattern for plus-addressing (e.g., `e2e-bot+*@append.test`)
	if (!env.ALLOWED_EMAIL) {
		console.warn('[E2E Auth] ALLOWED_EMAIL is required for E2E login');
		return c.text('Forbidden', 403);
	}
	if (!emailMatchesAllowlist(trimmedEmail, env.ALLOWED_EMAIL)) {
		console.warn('[E2E Auth] E2E_AUTH_EMAIL does not match ALLOWED_EMAIL pattern');
		return c.text('Forbidden', 403);
	}

	// Get auth instance
	const auth = c.get('auth');
	const ctx = await auth.$context;

	// Generate request ID for tracing (use cf-ray if available, otherwise random)
	const requestId = c.req.header('cf-ray') || crypto.randomUUID().slice(0, 8);

	// Log invocation (without secret)
	const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
	const ua = c.req.header('user-agent') || 'unknown';
	console.log(`[E2E Auth] [${requestId}] Login attempt: env=${env.APP_ENV}, ip=${ip}, ua=${ua.slice(0, 50)}`);

	try {
		// Find or create E2E user (trimmedEmail already validated above)
		const email = trimmedEmail.toLowerCase();
		const existingUser = await ctx.internalAdapter.findUserByEmail(email);
		let user = existingUser?.user;

		if (!user) {
			// Create user (triggers databaseHooks for allowlist + bucket seeding)
			user = await ctx.internalAdapter.createUser({
				email,
				name: 'E2E Test User',
				emailVerified: true,
			});

			// Link E2E account (not Google, but still need an account record)
			await ctx.internalAdapter.linkAccount({
				accountId: user.id,
				providerId: 'e2e',
				userId: user.id,
			});

			console.log(`[E2E Auth] [${requestId}] Created new user: ${user.id}`);
		}

		// Create session using internal adapter
		const session = await ctx.internalAdapter.createSession(user.id, false);
		if (!session) {
			console.error(`[E2E Auth] [${requestId}] Failed to create session`);
			return c.text('Internal Server Error', 500);
		}

		// Use Better Auth's createAuthCookie to get the properly configured cookie settings
		const cookieConfig = ctx.createAuthCookie('session_token', {
			maxAge: SESSION_MAX_AGE_SECONDS,
		});

		// Build cookie string from the config
		const attrs = cookieConfig.attributes;
		const parts = [`${cookieConfig.name}=${session.token}`];
		if (attrs.maxAge) parts.push(`Max-Age=${attrs.maxAge}`);
		if (attrs.path) parts.push(`Path=${attrs.path}`);
		if (attrs.httpOnly) parts.push('HttpOnly');
		if (attrs.sameSite) parts.push(`SameSite=${attrs.sameSite}`);
		if (attrs.secure) parts.push('Secure');

		c.header('Set-Cookie', parts.join('; '));

		console.log(`[E2E Auth] [${requestId}] Session created for user: ${user.id}`);
		return c.body(null, 204);
	} catch (error) {
		// User creation may fail if not on allowlist (expected behavior)
		console.error(`[E2E Auth] [${requestId}] Failed:`, error);
		return c.text('Forbidden', 403);
	}
});

export { e2eLoginRoute, emailMatchesAllowlist };

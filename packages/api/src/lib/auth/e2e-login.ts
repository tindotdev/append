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
 * Uses Web Crypto API's timingSafeEqual via subtle comparison.
 */
async function secureCompare(a: string, b: string): Promise<boolean> {
	if (a.length !== b.length) {
		// Still do comparison to avoid leaking length via timing
		const dummy = new TextEncoder().encode(a);
		const dummyKey = await crypto.subtle.importKey('raw', dummy, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
		await crypto.subtle.sign('HMAC', dummyKey, dummy);
		return false;
	}

	const encoder = new TextEncoder();
	const aBytes = encoder.encode(a);
	const bBytes = encoder.encode(b);

	// Use HMAC-based comparison for constant-time behavior
	const key = await crypto.subtle.importKey('raw', aBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const sig = await crypto.subtle.sign('HMAC', key, bBytes);
	const expected = await crypto.subtle.sign('HMAC', key, aBytes);

	// Compare signatures (same if inputs match)
	const sigArr = new Uint8Array(sig);
	const expArr = new Uint8Array(expected);
	let match = sigArr.length === expArr.length;
	for (let i = 0; i < sigArr.length; i++) {
		match = match && sigArr[i] === expArr[i];
	}
	return match;
}

/** Valid APP_ENV values */
const VALID_APP_ENVS = ['production', 'preview', 'local', 'test'] as const;

/** Session max age in seconds (7 days) */
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

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

	// Guard 3: Secret header validation (constant-time) → 403
	const providedSecret = c.req.header('x-e2e-secret');
	if (!providedSecret || !(await secureCompare(providedSecret, env.E2E_AUTH_SECRET))) {
		console.warn('[E2E Auth] Invalid or missing x-e2e-secret header');
		return c.text('Forbidden', 403);
	}

	// Guard 4: Allowlist validation → 403
	// E2E_AUTH_EMAIL must be in allowlist. Bypass if ALLOWED_SUB is set (owner has sub-based access).
	if (!env.ALLOWED_EMAIL && !env.ALLOWED_SUB) {
		console.warn('[E2E Auth] No allowlist configured');
		return c.text('Forbidden', 403);
	}

	// If ALLOWED_SUB is set, bypass email check (owner has sub-based access, E2E can use any email)
	// Otherwise, ALLOWED_EMAIL must match E2E_AUTH_EMAIL
	if (!env.ALLOWED_SUB && env.ALLOWED_EMAIL && env.ALLOWED_EMAIL.toLowerCase() !== env.E2E_AUTH_EMAIL.toLowerCase()) {
		console.warn('[E2E Auth] E2E_AUTH_EMAIL does not match ALLOWED_EMAIL');
		return c.text('Forbidden', 403);
	}

	// Get auth instance
	const auth = c.get('auth');
	const ctx = await auth.$context;

	// Log invocation (without secret)
	const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
	const ua = c.req.header('user-agent') || 'unknown';
	console.log(`[E2E Auth] Login attempt: env=${env.APP_ENV}, ip=${ip}, ua=${ua.slice(0, 50)}`);

	try {
		// Find or create E2E user
		const email = env.E2E_AUTH_EMAIL.toLowerCase();
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

			console.log(`[E2E Auth] Created new user: ${user.id}`);
		}

		// Create session using internal adapter
		const session = await ctx.internalAdapter.createSession(user.id, false);
		if (!session) {
			console.error('[E2E Auth] Failed to create session');
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

		console.log(`[E2E Auth] Session created for user: ${user.id}`);
		return c.body(null, 204);
	} catch (error) {
		// User creation may fail if not on allowlist (expected behavior)
		console.error('[E2E Auth] Failed:', error);
		return c.text('Forbidden', 403);
	}
});

export { e2eLoginRoute };

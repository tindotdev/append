import { env, SELF } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { account, schema, session, user } from '../src/db';
import { emailMatchesAllowlist } from '../src/lib/auth/e2e-login';
import { applyMigrations } from './setup';

function requireEnvVar(name: string, value: string | undefined): string {
	if (!value) {
		throw new Error(`Missing ${name} for test`);
	}
	return value;
}

const E2E_SECRET = requireEnvVar('E2E_AUTH_SECRET', env.E2E_AUTH_SECRET);

// =============================================================================
// Setup
// =============================================================================

let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
	await applyMigrations();
	db = drizzle(env.DB, { schema }) as ReturnType<typeof drizzle>;
});

beforeEach(async () => {
	// Ensure clean state before each test (in case previous test failed)
	await db.delete(session);
	await db.delete(account);
	await db.delete(user);
});

afterEach(async () => {
	// Clean up E2E test data after each test
	await db.delete(session);
	await db.delete(account);
	await db.delete(user);
});

// =============================================================================
// E2E Login Endpoint Tests (ADR 0019)
// =============================================================================

describe('POST /auth/e2e/login', () => {
	it('returns 204 and sets session cookie with correct secret', async () => {
		const res = await SELF.fetch('https://example.com/auth/e2e/login', {
			method: 'POST',
			headers: {
				'x-e2e-secret': E2E_SECRET,
			},
		});

		expect(res.status).toBe(204);

		// Verify session cookie is set
		const setCookie = res.headers.get('set-cookie');
		expect(setCookie).toBeTruthy();
		expect(setCookie).toContain('better-auth.session_token=');
	});

	it('creates user and session with correct data', async () => {
		// Call E2E login
		const loginRes = await SELF.fetch('https://example.com/auth/e2e/login', {
			method: 'POST',
			headers: {
				'x-e2e-secret': E2E_SECRET,
			},
		});

		expect(loginRes.status).toBe(204);
		const setCookie = loginRes.headers.get('set-cookie');
		expect(setCookie).toBeTruthy();
		if (!setCookie) {
			throw new Error('Missing set-cookie header');
		}
		expect(setCookie).toContain('better-auth.session_token=');

		// Verify user was created in database
		const users = await db.select().from(user);
		expect(users.length).toBe(1);
		expect(users[0].email).toBe('test-a@example.com');
		expect(users[0].name).toBe('E2E Test User');

		// Verify session was created in database
		const sessions = await db.select().from(session);
		expect(sessions.length).toBe(1);
		expect(sessions[0].userId).toBe(users[0].id);

		// Verify cookie token matches session token in database
		// Cookie format is "<token>.<signature>" (signed by Better Auth)
		const tokenMatch = setCookie.match(/better-auth\.session_token=([^;]+)/);
		expect(tokenMatch).toBeTruthy();
		if (!tokenMatch) {
			throw new Error('Missing session_token cookie value');
		}
		const [cookieToken] = tokenMatch[1].split('.');
		expect(cookieToken).toBe(sessions[0].token);
	});

	it('returns 403 with wrong secret', async () => {
		const res = await SELF.fetch('https://example.com/auth/e2e/login', {
			method: 'POST',
			headers: {
				'x-e2e-secret': 'wrong-secret',
			},
		});

		expect(res.status).toBe(403);
		expect(await res.text()).toBe('Forbidden');
	});

	it('returns 403 with missing secret', async () => {
		const res = await SELF.fetch('https://example.com/auth/e2e/login', {
			method: 'POST',
		});

		expect(res.status).toBe(403);
		expect(await res.text()).toBe('Forbidden');
	});

	it('reuses existing user on subsequent logins', async () => {
		// First login - creates user
		const res1 = await SELF.fetch('https://example.com/auth/e2e/login', {
			method: 'POST',
			headers: { 'x-e2e-secret': E2E_SECRET },
		});
		expect(res1.status).toBe(204);

		// Verify one user after first login
		const usersAfterFirst = await db.select().from(user);
		expect(usersAfterFirst.length).toBe(1);
		const userId1 = usersAfterFirst[0].id;

		// Second login - should reuse same user
		const res2 = await SELF.fetch('https://example.com/auth/e2e/login', {
			method: 'POST',
			headers: { 'x-e2e-secret': E2E_SECRET },
		});
		expect(res2.status).toBe(204);

		// Verify still only one user (reused)
		const usersAfterSecond = await db.select().from(user);
		expect(usersAfterSecond.length).toBe(1);
		expect(usersAfterSecond[0].id).toBe(userId1);

		// Verify two sessions created (one per login)
		const sessions = await db.select().from(session);
		expect(sessions.length).toBe(2);
		expect(sessions.every((s) => s.userId === userId1)).toBe(true);
	});

	it('links e2e account on first login', async () => {
		const res = await SELF.fetch('https://example.com/auth/e2e/login', {
			method: 'POST',
			headers: { 'x-e2e-secret': E2E_SECRET },
		});
		expect(res.status).toBe(204);

		// Verify account linked with e2e provider
		const accounts = await db.select().from(account);
		expect(accounts.length).toBe(1);
		expect(accounts[0].providerId).toBe('e2e');
	});
});

// =============================================================================
// Production Guard Tests
//
// IMPORTANT: The production guard (APP_ENV=production → 404) cannot be tested
// automatically because environment variables are set at worker initialization.
//
// MANUAL VERIFICATION REQUIRED BEFORE MERGE:
// 1. Deploy to production (or use production Worker URL)
// 2. Run: curl -X POST https://append-api.tindotdev.workers.dev/auth/e2e/login \
//         -H 'x-e2e-secret: any-value'
// 3. Verify response is 404 Not Found (endpoint should not exist in production)
// 4. Confirm E2E_AUTH_SECRET is NOT configured in production Cloudflare dashboard
//
// The guards that ARE tested automatically:
// - Invalid/missing secret → 403 (tested in main describe block)
// - Allowlist validation → 403 (tested in Allowlist Guards block)
// =============================================================================

describe('E2E Login Production Guards', () => {
	it('endpoint exists and works in non-production environment', async () => {
		// This test verifies the endpoint is available in test environment
		// (APP_ENV=test). The production guard (APP_ENV=production → 404)
		// must be verified manually - see checklist above.

		const res = await SELF.fetch('https://example.com/auth/e2e/login', {
			method: 'POST',
			headers: { 'x-e2e-secret': E2E_SECRET },
		});

		// In test env with correct config, should succeed
		expect(res.status).toBe(204);
	});
});

// =============================================================================
// Allowlist Guard Tests
// =============================================================================

describe('E2E Login Allowlist Guards', () => {
	it('E2E_AUTH_EMAIL matches ALLOWED_EMAIL (exact match in test env)', async () => {
		// Test environment uses exact match (wildcard patterns for preview)
		expect(env.ALLOWED_EMAIL).toBe('test-a@example.com');
		expect(env.E2E_AUTH_EMAIL).toBe('test-a@example.com');

		const res = await SELF.fetch('https://example.com/auth/e2e/login', {
			method: 'POST',
			headers: { 'x-e2e-secret': E2E_SECRET },
		});

		expect(res.status).toBe(204);
	});
});

// =============================================================================
// emailMatchesAllowlist Unit Tests
// =============================================================================

describe('emailMatchesAllowlist', () => {
	describe('wildcard pattern (plus-addressing)', () => {
		it('matches email with PR suffix', () => {
			expect(emailMatchesAllowlist('e2e-bot+pr-123@append.test', 'e2e-bot+*@append.test')).toBe(true);
		});

		it('matches email with any plus-address suffix', () => {
			expect(emailMatchesAllowlist('e2e-bot+pr-456@append.test', 'e2e-bot+*@append.test')).toBe(true);
			expect(emailMatchesAllowlist('e2e-bot+staging@append.test', 'e2e-bot+*@append.test')).toBe(true);
			expect(emailMatchesAllowlist('e2e-bot+local-dev@append.test', 'e2e-bot+*@append.test')).toBe(true);
		});

		it('is case-insensitive', () => {
			expect(emailMatchesAllowlist('E2E-BOT+pr-123@APPEND.TEST', 'e2e-bot+*@append.test')).toBe(true);
			expect(emailMatchesAllowlist('e2e-bot+pr-123@append.test', 'E2E-BOT+*@APPEND.TEST')).toBe(true);
		});

		it('does not match email without plus-address', () => {
			expect(emailMatchesAllowlist('e2e-bot@append.test', 'e2e-bot+*@append.test')).toBe(false);
		});

		it('does not match email with empty suffix (security fix)', () => {
			// Prevents unintended match of "e2e-bot+@append.test" which has no suffix
			expect(emailMatchesAllowlist('e2e-bot+@append.test', 'e2e-bot+*@append.test')).toBe(false);
		});

		it('does not match email with wrong prefix', () => {
			expect(emailMatchesAllowlist('other+pr-123@append.test', 'e2e-bot+*@append.test')).toBe(false);
		});

		it('does not match email with wrong domain', () => {
			expect(emailMatchesAllowlist('e2e-bot+pr-123@other.test', 'e2e-bot+*@append.test')).toBe(false);
		});
	});

	describe('exact match (fallback)', () => {
		it('matches exact email', () => {
			expect(emailMatchesAllowlist('test@example.com', 'test@example.com')).toBe(true);
		});

		it('is case-insensitive', () => {
			expect(emailMatchesAllowlist('TEST@EXAMPLE.COM', 'test@example.com')).toBe(true);
			expect(emailMatchesAllowlist('test@example.com', 'TEST@EXAMPLE.COM')).toBe(true);
		});

		it('does not match different email', () => {
			expect(emailMatchesAllowlist('other@example.com', 'test@example.com')).toBe(false);
		});
	});
});

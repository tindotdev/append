import { SELF } from 'cloudflare:test';
import { expect } from 'vitest';

const DEFAULT_EMAIL = 'test+a@example.com';
const DEFAULT_PASSWORD = 'test-password-123';
const DEFAULT_NAME = 'Test User';

async function signUpIfNeeded(email: string, password: string, name: string): Promise<void> {
	const signUpRes = await SELF.fetch('https://example.com/auth/sign-up/email', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email, password, name }),
	});

	if (!signUpRes.ok) {
		const body = await signUpRes.text();
		if (!body.includes('already exists') && !body.includes('USER_ALREADY_EXISTS')) {
			throw new Error(`Sign-up failed: ${body}`);
		}
	}
}

async function signIn(email: string, password: string): Promise<string> {
	const signInRes = await SELF.fetch('https://example.com/auth/sign-in/email', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email, password }),
	});

	if (!signInRes.ok) {
		const body = await signInRes.text();
		throw new Error(`Sign-in failed: ${body}`);
	}

	const setCookie = signInRes.headers.get('set-cookie');
	if (!setCookie) {
		throw new Error('No set-cookie header from sign-in');
	}

	return setCookie;
}

/**
 * Sign up and sign in a test user, returning the session cookie.
 */
export async function getAuthCookie(
	email: string = DEFAULT_EMAIL,
	password: string = DEFAULT_PASSWORD,
	name: string = DEFAULT_NAME
): Promise<string> {
	await signUpIfNeeded(email, password, name);
	return signIn(email, password);
}

/**
 * Sign up and sign in a test user, returning the session cookie and user ID.
 */
export async function getAuthCookieAndUserId(
	email: string = DEFAULT_EMAIL,
	password: string = DEFAULT_PASSWORD,
	name: string = DEFAULT_NAME
): Promise<{ cookie: string; userId: string }> {
	const cookie = await getAuthCookie(email, password, name);

	const sessionRes = await SELF.fetch('https://example.com/auth/get-session', {
		headers: { cookie },
	});

	if (!sessionRes.ok) {
		throw new Error('Failed to get session');
	}

	const session = (await sessionRes.json()) as { user: { id: string } };

	return { cookie, userId: session.user.id };
}

/**
 * Generate N newline-separated terms.
 */
export function generateTerms(count: number): string {
	return Array.from({ length: count }, (_, i) => `term-${i + 1}`).join('\n');
}

/**
 * Generate a valid UUID v4.
 */
export function generateUUID(): string {
	return crypto.randomUUID();
}

/**
 * Authenticated fetch helper.
 */
export async function authFetch(path: string, options: RequestInit & { cookie: string }): Promise<Response> {
	const { cookie, headers, ...rest } = options;
	return SELF.fetch(`https://example.com${path}`, {
		...rest,
		headers: { ...headers, cookie },
	});
}

/**
 * Assert error response shape.
 */
export async function expectError(res: Response, status: number, code: string): Promise<void> {
	expect(res.status).toBe(status);
	const body = (await res.json()) as { error: { code: string } };
	expect(body.error.code).toBe(code);
}

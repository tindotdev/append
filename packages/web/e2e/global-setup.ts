/**
 * Playwright globalSetup for E2E auth bootstrap (ADR 0019).
 *
 * Calls POST /auth/e2e/login on the API to obtain authenticated session
 * without automating Google OAuth UI. Saves storageState for authenticated tests.
 *
 * Environment variables:
 * - E2E_AUTH_SECRET: Required. The secret to authenticate with the E2E endpoint.
 * - PLAYWRIGHT_API_URL: Optional. Override the API URL (default: http://localhost:8787)
 * - PLAYWRIGHT_BASE_URL: Optional. Override the web URL (default: http://localhost:5173)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// ESM equivalent of __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// API URL for E2E login endpoint (Worker) - used for login request and cookie domain
const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

// Web URL for setting cookies in the browser (fallback domain if API_URL not set)
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

/**
 * Get the domain to use for cookies.
 *
 * For cross-site preview environments (web on Pages, API on Workers):
 * - Cookie domain must be the API domain since that's where authenticated
 *   requests are sent and where the cookie needs to be included
 * - With SameSite=None; Secure, the browser will send the cookie cross-origin
 *   from the web app to the API
 *
 * For local development (same-origin):
 * - Use localhost since both web and API are on localhost
 */
function getCookieDomain(): string {
	const apiUrl = new URL(API_URL);
	// For preview (cross-site), use API domain - cookies are sent TO the API
	if (apiUrl.hostname !== 'localhost') {
		return apiUrl.hostname;
	}
	// For local dev (same-origin), use localhost
	return new URL(BASE_URL).hostname;
}

async function globalSetup(): Promise<void> {
	const secret = process.env.E2E_AUTH_SECRET;
	if (!secret) {
		throw new Error(
			'E2E_AUTH_SECRET environment variable is required for E2E tests.\n' +
				'For local development: set E2E_AUTH_SECRET in packages/api/.dev.vars\n' +
				'For CI: ensure E2E_AUTH_SECRET is configured in GitHub Actions secrets'
		);
	}

	console.log(`[E2E Setup] Authenticating via ${API_URL}/auth/e2e/login`);

	// Call the E2E login endpoint
	const response = await fetch(`${API_URL}/auth/e2e/login`, {
		method: 'POST',
		headers: {
			'x-e2e-secret': secret,
		},
	});

	if (!response.ok) {
		const text = await response.text();
		const hints =
			response.status === 404
				? '\nHint: 404 means endpoint unavailable. Check APP_ENV is not "production" and E2E_AUTH_SECRET/E2E_AUTH_EMAIL are configured.'
				: response.status === 403
					? '\nHint: 403 means auth failed. Verify E2E_AUTH_SECRET matches between client and server, and E2E_AUTH_EMAIL is on the allowlist.'
					: response.status === 500
						? '\nHint: 500 means server error. Check the API Worker logs for errors. Common causes: missing database tables (run migrations), missing environment bindings, or code errors.'
						: '';
		throw new Error(`E2E login failed: ${response.status} ${response.statusText} - ${text}${hints}\nAPI URL: ${API_URL}`);
	}

	// Extract cookies from response
	const setCookieHeader = response.headers.get('set-cookie');
	if (!setCookieHeader) {
		throw new Error('E2E login did not return session cookie');
	}

	// Parse the cookie from the set-cookie header
	// Format: better-auth.session_token=VALUE; Path=/; HttpOnly; SameSite=...
	const cookieDomain = getCookieDomain();
	const cookies = parseCookies(setCookieHeader, cookieDomain);

	console.log(`[E2E Setup] Got ${cookies.length} cookie(s) for domain: ${cookieDomain}`);
	console.log(
		`[E2E Setup] Cookie details: ${JSON.stringify(cookies.map((c) => ({ name: c.name, domain: c.domain, secure: c.secure, sameSite: c.sameSite })))}`
	);

	// Create a browser context to save the storage state with cookies
	const browser = await chromium.launch();
	const context = await browser.newContext();

	// Add the cookies to the context
	await context.addCookies(cookies);

	// Navigate to API domain to ensure cookies are properly associated
	// This helps with cross-origin cookie handling in some browsers
	const page = await context.newPage();
	await page.goto(API_URL, { waitUntil: 'domcontentloaded' });

	// Verify session is valid by calling get-session endpoint
	// This catches auth issues immediately instead of failing all tests
	console.log('[E2E Setup] Verifying session via /auth/get-session...');
	const sessionResponse = await page.evaluate(async (apiUrl) => {
		const res = await fetch(`${apiUrl}/auth/get-session`, {
			credentials: 'include',
		});
		const data = await res.json();
		return { ok: res.ok, status: res.status, data };
	}, API_URL);

	if (!sessionResponse.ok || !sessionResponse.data?.session) {
		throw new Error(
			`[E2E Setup] Session verification failed!\n` +
				`Status: ${sessionResponse.status}\n` +
				`Response: ${JSON.stringify(sessionResponse.data, null, 2)}\n\n` +
				`This usually means the cookie signature is invalid or the session expired.\n` +
				`Check that BETTER_AUTH_SECRET matches between the E2E login endpoint and the get-session endpoint.`
		);
	}
	console.log(`[E2E Setup] Session verified for user: ${sessionResponse.data.user?.email ?? 'unknown'}`);

	await page.close();

	// Ensure .auth directory exists
	const authDir = path.join(__dirname, '.auth');
	if (!fs.existsSync(authDir)) {
		fs.mkdirSync(authDir, { recursive: true });
	}

	// Save the storage state
	const storageStatePath = path.join(authDir, 'storage-state.json');
	await context.storageState({ path: storageStatePath });

	console.log(`[E2E Setup] Saved storageState to ${storageStatePath}`);

	await browser.close();
}

interface PlaywrightCookie {
	name: string;
	value: string;
	domain: string;
	path: string;
	httpOnly: boolean;
	secure: boolean;
	sameSite: 'Strict' | 'Lax' | 'None';
}

/**
 * Parse a single cookie attribute and update the cookie object.
 */
function parseAttribute(attr: string, cookie: PlaywrightCookie): void {
	const lowerAttr = attr.toLowerCase();
	if (lowerAttr.startsWith('path=')) {
		cookie.path = attr.substring(5);
	} else if (lowerAttr === 'httponly') {
		cookie.httpOnly = true;
	} else if (lowerAttr === 'secure') {
		cookie.secure = true;
	} else if (lowerAttr.startsWith('samesite=')) {
		const value = attr.substring(9).toLowerCase();
		cookie.sameSite = value === 'strict' ? 'Strict' : value === 'none' ? 'None' : 'Lax';
	}
}

/**
 * Parse a single Set-Cookie string into a Playwright cookie.
 */
function parseSingleCookie(cookieStr: string, domain: string): PlaywrightCookie {
	const parts = cookieStr.split(';').map((p) => p.trim());
	const [nameValue, ...attrs] = parts;
	const [name, ...valueParts] = nameValue.split('=');
	const value = valueParts.join('='); // Handle values with = in them

	const cookie: PlaywrightCookie = {
		name,
		value,
		domain,
		path: '/',
		httpOnly: false,
		secure: false,
		sameSite: 'Lax',
	};

	for (const attr of attrs) {
		parseAttribute(attr, cookie);
	}

	return cookie;
}

/**
 * Parse Set-Cookie header into Playwright cookie format.
 *
 * The E2E endpoint returns a single session cookie, so we parse it directly
 * without attempting to split multiple cookies. This avoids edge cases with
 * comma-separated cookies where values might contain commas.
 */
function parseCookies(setCookieHeader: string, domain: string): PlaywrightCookie[] {
	// E2E endpoint returns single cookie - parse directly
	return [parseSingleCookie(setCookieHeader, domain)];
}

export default globalSetup;

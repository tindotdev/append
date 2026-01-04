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
import { chromium } from '@playwright/test';

// API URL for E2E login endpoint (Worker)
const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

// Web URL for setting cookies in the browser
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

async function globalSetup(): Promise<void> {
	const secret = process.env.E2E_AUTH_SECRET;
	if (!secret) {
		throw new Error('E2E_AUTH_SECRET environment variable is required for E2E tests');
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
		throw new Error(`E2E login failed: ${response.status} ${response.statusText} - ${text}`);
	}

	// Extract cookies from response
	const setCookieHeader = response.headers.get('set-cookie');
	if (!setCookieHeader) {
		throw new Error('E2E login did not return session cookie');
	}

	// Parse the cookie from the set-cookie header
	// Format: better-auth.session_token=VALUE; Path=/; HttpOnly; SameSite=...
	const cookies = parseCookies(setCookieHeader, BASE_URL);

	console.log(`[E2E Setup] Got ${cookies.length} cookie(s), saving to storageState`);

	// Create a browser context to save the storage state with cookies
	const browser = await chromium.launch();
	const context = await browser.newContext();

	// Add the cookies to the context
	await context.addCookies(cookies);

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
 */
function parseCookies(setCookieHeader: string, baseUrl: string): PlaywrightCookie[] {
	const url = new URL(baseUrl);
	const domain = url.hostname;

	// Split multiple cookies (may be separated by comma in some implementations)
	const cookieStrings = setCookieHeader.split(/,(?=[^;]*=)/);

	return cookieStrings.map((cookieStr) => parseSingleCookie(cookieStr, domain));
}

export default globalSetup;

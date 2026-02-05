/**
 * Shared vitest configuration utilities for all test suites.
 *
 * This module provides common test environment setup to prevent configuration drift
 * between different test suites (main, extension, preview).
 */

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

/**
 * Setup XDG config directory for wrangler debug logs.
 * Must be called before vitest configuration is defined.
 */
export function setupXdgConfig(): void {
	const xdgConfigHome = resolve(process.cwd(), '..', '..', 'tmp', 'xdg-config');
	mkdirSync(xdgConfigHome, { recursive: true });
	process.env.XDG_CONFIG_HOME = xdgConfigHome;
}

/**
 * Get common test bindings shared across all test suites.
 *
 * These bindings provide a consistent test environment with:
 * - Email/password auth enabled for testing
 * - Consistent allowlist patterns
 * - Stub providers for external dependencies
 * - E2E auth bootstrap configuration
 *
 * @param migrations - D1 migrations to inject into the test environment
 * @returns Common test bindings object
 */
export function getCommonTestBindings(migrations: any) {
	return {
		// Auth configuration
		ENABLE_TEST_EMAIL_PASSWORD_AUTH: '1',
		BETTER_AUTH_URL: 'http://localhost:8787',
		BETTER_AUTH_SECRET: 'test-secret-min-32-chars-for-cookie-signing',

		// Allowlist configuration (using wildcard pattern for test flexibility)
		ALLOWED_EMAIL: 'test+*@example.com',
		ALLOWED_SUB: 'test-sub-for-owner-access',

		// OAuth providers (test credentials)
		GOOGLE_CLIENT_ID: 'test-google-client-id',
		GOOGLE_CLIENT_SECRET: 'test-google-client-secret',

		// Provider stubs
		SUGGESTIONS_PROVIDER: 'stub',

		// Telemetry pairing gate (ADR 0025): bypass in tests for test user flexibility
		TELEMETRY_PAIRING_ENABLED: '1',

		// E2E Auth Bootstrap (ADR 0019)
		E2E_AUTH_SECRET: 'test-e2e-secret-min-32-chars-for-hmac',
		E2E_AUTH_EMAIL: 'test+a@example.com',

		// D1 migrations
		TEST_MIGRATIONS: migrations,
	} as const;
}

/**
 * Read D1 migrations from the drizzle directory.
 * Must be called at the top level of the config file (not inside defineWorkersConfig).
 *
 * @returns Migrations array to pass to getCommonTestBindings
 */
export async function getMigrations() {
	// Use import.meta.dirname to resolve relative to the config file (one level up from test/)
	const migrationsPath = resolve(process.cwd(), 'drizzle');
	return await readD1Migrations(migrationsPath);
}

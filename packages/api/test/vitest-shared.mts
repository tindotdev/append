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

	// This repo runs in a workspace-limited sandbox where writing to `$HOME` is
	// disallowed. Wrangler/Miniflare may use XDG data/cache/state directories for
	// local persistence (including D1). Point all XDG roots at writable paths.
	const xdgDataHome = resolve(process.cwd(), '..', '..', 'tmp', 'xdg-data');
	const xdgCacheHome = resolve(process.cwd(), '..', '..', 'tmp', 'xdg-cache');
	const xdgStateHome = resolve(process.cwd(), '..', '..', 'tmp', 'xdg-state');
	mkdirSync(xdgDataHome, { recursive: true });
	mkdirSync(xdgCacheHome, { recursive: true });
	mkdirSync(xdgStateHome, { recursive: true });
	process.env.XDG_DATA_HOME = xdgDataHome;
	process.env.XDG_CACHE_HOME = xdgCacheHome;
	process.env.XDG_STATE_HOME = xdgStateHome;

	// Miniflare uses the OS temp directory for local persistence when no explicit
	// persist root is configured. In this environment, `/tmp` is tmpfs, which can
	// trigger workerd sqlite `SQLITE_CANTOPEN`. Point temp at a workspace path.
	const testTmpDir = resolve(process.cwd(), '..', '..', 'tmp', 'miniflare-tmp');
	mkdirSync(testTmpDir, { recursive: true });
	process.env.TMPDIR = testTmpDir;
	process.env.TMP = testTmpDir;
	process.env.TEMP = testTmpDir;
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
		APP_ENV: 'test',

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

		// Admin sub for quota tests (ADR 0026)
		ADMIN_SUB: 'test-admin-google-sub-123',

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

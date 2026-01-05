import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E tests.
 *
 * Supports two modes:
 * - Local dev: starts vite dev server, runs against localhost
 * - Preview: uses deployed Pages URL, no local server
 *
 * Environment variables:
 * - PLAYWRIGHT_BASE_URL: Override the base URL (e.g., preview Pages URL)
 * - PLAYWRIGHT_API_URL: Override the API URL (e.g., preview Worker URL)
 * - E2E_AUTH_SECRET: Required for globalSetup auth bootstrap
 */

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const isPreview = baseURL.includes('pages.dev');

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	// Reduce retries for faster feedback (1 retry = 2 attempts max)
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: process.env.CI ? 'github' : 'html',
	timeout: 30_000,
	// Stop after 3 failures for faster feedback in CI
	maxFailures: process.env.CI ? 3 : undefined,

	// Global setup runs first to authenticate
	globalSetup: './e2e/global-setup.ts',

	use: {
		baseURL,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',

		// Use storageState from globalSetup (authenticated session)
		storageState: './e2e/.auth/storage-state.json',
	},

	// Reduce assertion timeout for faster failure detection
	expect: {
		timeout: 3_000,
	},

	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],

	// Start dev server only in local mode
	webServer: isPreview
		? undefined
		: {
				command: 'pnpm dev',
				port: 5173,
				reuseExistingServer: !process.env.CI,
			},
});

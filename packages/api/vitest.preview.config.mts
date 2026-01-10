import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

// Wrangler writes debug logs under XDG config. Ensure it points at a writable path.
const xdgConfigHome = resolve(process.cwd(), '..', '..', 'tmp', 'xdg-config');
mkdirSync(xdgConfigHome, { recursive: true });
process.env.XDG_CONFIG_HOME = xdgConfigHome;

// Read D1 migrations from the drizzle directory (runs in Node.js context)
const migrationsPath = resolve(import.meta.dirname, 'drizzle');
const migrations = await readD1Migrations(migrationsPath);

export default defineWorkersConfig({
	test: {
		include: ['test/**/*.preview.spec.ts'],
		exclude: ['**/node_modules/**'],
		poolOptions: {
			workers: {
				wrangler: {
					configPath: './wrangler.jsonc',
					environment: 'test',
				},
				// Override .dev.vars with preview-focused values
				miniflare: {
					bindings: {
						APP_ENV: 'preview',
						// Keep test-friendly auth defaults (used across the suite)
						ENABLE_TEST_EMAIL_PASSWORD_AUTH: '1',
						BETTER_AUTH_URL: 'http://localhost:8787',
						BETTER_AUTH_SECRET: 'test-secret-min-32-chars-for-cookie-signing',
						ALLOWED_EMAIL: 'test-a@example.com',
						ALLOWED_SUB: 'test-sub-for-owner-access',
						GOOGLE_CLIENT_ID: 'test-google-client-id',
						GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
						SUGGESTIONS_PROVIDER: 'stub',
						// E2E Auth Bootstrap (ADR 0019)
						E2E_AUTH_SECRET: 'test-e2e-secret-min-32-chars-for-hmac',
						E2E_AUTH_EMAIL: 'test-a@example.com',
						// D1 migrations read in Node.js context, passed to Workers runtime
						TEST_MIGRATIONS: migrations,
					},
				},
			},
		},
	},
});

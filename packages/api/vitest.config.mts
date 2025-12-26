import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: {
					configPath: './wrangler.jsonc',
					environment: 'test', // Use test environment with email/password auth (§5.2)
				},
				// Override .dev.vars with test-specific values
				miniflare: {
					bindings: {
						// Test environment variables (override .dev.vars)
						ENABLE_TEST_EMAIL_PASSWORD_AUTH: '1',
						BETTER_AUTH_URL: 'http://localhost:8787',
						BETTER_AUTH_SECRET: 'test-secret-min-32-chars-for-cookie-signing',
						ALLOWED_EMAIL: 'test-a@example.com',
						GOOGLE_CLIENT_ID: 'test-google-client-id',
						GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
						SUGGESTIONS_PROVIDER: 'stub',
						// AI binding not needed for tests since we use stub provider
					},
				},
			},
		},
	},
});

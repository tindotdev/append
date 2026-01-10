import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { getCommonTestBindings, getMigrations, setupXdgConfig } from './test/vitest-shared.mjs';

setupXdgConfig();
const migrations = await getMigrations();

export default defineWorkersConfig({
	test: {
		exclude: ['**/*.preview.spec.ts', '**/*.extension.spec.ts', '**/node_modules/**'],
		poolOptions: {
			workers: {
				wrangler: {
					configPath: './wrangler.jsonc',
					environment: 'test', // Use test environment with email/password auth (§5.2)
				},
				miniflare: {
					bindings: {
						...getCommonTestBindings(migrations),
						// Extension allowlist (ADR 0021) - explicitly empty to test secure-by-default behavior
						ALLOWED_EXTENSION_IDS: '',
					},
				},
			},
		},
	},
});

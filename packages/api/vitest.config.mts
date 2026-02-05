import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { getCommonTestBindings, getMigrations, setupXdgConfig } from './test/vitest-shared.mjs';

setupXdgConfig();
const migrations = await getMigrations();

export default defineWorkersConfig({
	test: {
		exclude: ['**/*.preview.spec.ts', '**/*.extension.spec.ts', '**/node_modules/**'],
		poolOptions: {
			workers: {
				// Keep all bindings local in tests (avoid remote proxy sessions).
				remoteBindings: false,
				wrangler: {
					configPath: './wrangler.jsonc',
					environment: 'test', // Use test environment with email/password auth (§5.2)
				},
				miniflare: {
					bindings: {
						...getCommonTestBindings(migrations),
						// Keep export truncation tests fast by lowering the max row cap in test only.
						EVENTS_EXPORT_MAX_TOTAL_ROWS: '1200',
						// Extension allowlist (ADR 0021) - explicitly empty to test secure-by-default behavior
						ALLOWED_EXTENSION_IDS: '',
					},
				},
			},
		},
	},
});

import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { getCommonTestBindings, getMigrations, setupXdgConfig } from './test/vitest-shared.mjs';

setupXdgConfig();
const migrations = await getMigrations();

export default defineWorkersConfig({
	test: {
		include: ['test/**/*.extension.spec.ts'],
		exclude: ['**/node_modules/**'],
		poolOptions: {
			workers: {
				wrangler: {
					configPath: './wrangler.jsonc',
					environment: 'test',
				},
				miniflare: {
					bindings: {
						...getCommonTestBindings(migrations),
						// Extension allowlist (ADR 0021)
						ALLOWED_EXTENSION_IDS: 'nnhipglpoenbcdonkbnfdcmfcfaggjle',
					},
				},
			},
		},
	},
});

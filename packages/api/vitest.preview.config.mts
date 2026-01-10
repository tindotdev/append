import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { getCommonTestBindings, getMigrations, setupXdgConfig } from './test/vitest-shared.mjs';

setupXdgConfig();
const migrations = await getMigrations();

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
				miniflare: {
					bindings: {
						...getCommonTestBindings(migrations),
						// Preview-specific override
						APP_ENV: 'preview',
					},
				},
			},
		},
	},
});

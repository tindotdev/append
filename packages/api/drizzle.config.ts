import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'drizzle-kit';

// Find local D1 SQLite file created by `wrangler dev`
function getLocalD1DB(): string | undefined {
	try {
		const basePath = path.resolve('.wrangler');
		const dbFile = fs.readdirSync(basePath, { encoding: 'utf-8', recursive: true }).find((f) => f.endsWith('.sqlite'));

		if (!dbFile) {
			throw new Error(`.sqlite file not found in ${basePath}`);
		}

		return path.resolve(basePath, dbFile);
	} catch (err) {
		console.log(`Local D1 not found (run 'wrangler dev' first): ${err}`);
		return undefined;
	}
}

// Local-only config for drizzle-kit generate/studio.
// Production migrations use `wrangler d1 migrations apply --remote`.
export default defineConfig({
	dialect: 'sqlite',
	schema: './src/db/index.ts',
	out: './drizzle',
	dbCredentials: {
		url: getLocalD1DB() ?? '',
	},
});

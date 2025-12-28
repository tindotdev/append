import { env } from 'cloudflare:test';

/**
 * Import all migration SQL files at build time using Vite's glob import.
 * This avoids Node.js fs APIs which aren't available in Workers runtime.
 */
const migrations = import.meta.glob('../drizzle/*.sql', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>;

/**
 * Apply all D1 migrations to the test database.
 * This runs before any tests execute.
 *
 * We collapse multi-line statements and execute individually because
 * Miniflare's D1 exec() has issues with multi-line SQL.
 */
export async function applyMigrations() {
	// Sort migration files by name (0000_*, 0001_*, etc.)
	const sortedPaths = Object.keys(migrations).sort();

	for (const filePath of sortedPaths) {
		const sql = migrations[filePath];
		const fileName = filePath.split('/').pop();

		// Remove Drizzle's statement-breakpoint comments
		const cleanedSql = sql.replace(/--> statement-breakpoint/g, '');

		// Split by semicolons, collapse to single line, execute individually
		const statements = cleanedSql
			.split(/;/)
			.map((s) =>
				s
					.replace(/[\r\n]+/g, ' ')
					.replace(/\s+/g, ' ')
					.trim()
			)
			.filter((s) => s.length > 0)
			.map((s) => `${s};`);

		for (const statement of statements) {
			try {
				await env.DB.exec(statement);
			} catch (error) {
				// Ignore "table already exists" / "index already exists" errors for idempotency
				if (error instanceof Error && !error.message.includes('already exists')) {
					console.error(`Error running migration ${fileName}:`, error);
					console.error(`Statement: ${statement.slice(0, 200)}...`);
					throw error;
				}
			}
		}
	}
}

import { applyD1Migrations, env } from 'cloudflare:test';

/**
 * Apply all D1 migrations to the test database.
 * This runs before any tests execute.
 *
 * Uses Cloudflare's built-in applyD1Migrations helper which:
 * - Reads migrations from TEST_MIGRATIONS binding (set in vitest.config.mts via readD1Migrations)
 * - Tracks applied migrations in d1_migrations table
 * - Is idempotent - safe to call multiple times
 */
export async function applyMigrations() {
	await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
}

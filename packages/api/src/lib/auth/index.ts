import type { D1Database, IncomingRequestCfProperties } from '@cloudflare/workers-types';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { withCloudflare } from 'better-auth-cloudflare';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { bucket, schema, type user } from '../../db';
import { DEFAULT_BUCKETS } from '../../db/default-buckets';
import { emailMatchesAllowlist } from './email-allowlist';

type Env = {
	DB: D1Database;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	BETTER_AUTH_SECRET?: string;
	BETTER_AUTH_URL?: string;
	// Auth mode (ADR 0025)
	AUTH_MODE?: string; // 'restricted' | 'public'
	PUBLIC_SIGNUP_ENABLED?: string; // kill switch ('0' = disabled)
	// Allowlist (ADR 0001)
	ALLOWED_SUB?: string;
	ALLOWED_EMAIL?: string;
	// Test-only: enable email/password auth (§5.2)
	ENABLE_TEST_EMAIL_PASSWORD_AUTH?: string;
	// E2E Auth Bootstrap (ADR 0019)
	APP_ENV?: string;
	E2E_AUTH_SECRET?: string;
	E2E_AUTH_EMAIL?: string;
};

/**
 * Get allowed origins based on environment (ADR 0019).
 * Preview environment includes Pages preview origin pattern.
 */
function getAllowedOrigins(env?: Env): string[] {
	const origins = ['http://localhost:5173', 'https://append.tindev.dev'];
	if (env?.APP_ENV === 'preview') {
		// Cloudflare Pages preview URLs (wildcard pattern for Better Auth)
		origins.push('https://*.append-web.pages.dev');
	}
	return origins;
}

/**
 * Check if we're in preview environment (ADR 0019).
 */
function isPreviewEnv(env?: Env): boolean {
	return env?.APP_ENV === 'preview';
}

/**
 * Check if email matches the allowlist (supports wildcards).
 */
function isEmailAllowed(env: Env, email: string): boolean {
	if (!env.ALLOWED_EMAIL) return false;
	return emailMatchesAllowlist(email, env.ALLOWED_EMAIL);
}

/**
 * Check if a user is allowed based on ADR 0001:
 * - Primary: Google sub (stable per account)
 * - Fallback: email (supports wildcards), only if sub not configured
 * - Fail closed: deny if no allowlist match
 */
function isUserAllowed(env: Env, userEmail: string, accountId?: string): boolean {
	// Primary check: sub (if configured)
	if (env.ALLOWED_SUB) {
		return accountId === env.ALLOWED_SUB;
	}

	// Fallback check: email (if configured, supports wildcard patterns)
	if (env.ALLOWED_EMAIL) {
		return emailMatchesAllowlist(userEmail, env.ALLOWED_EMAIL);
	}

	// Fail closed: no allowlist configured
	return false;
}

function assertAllowlistConfigured(env: Env): void {
	if (!env.ALLOWED_SUB && !env.ALLOWED_EMAIL) {
		throw new APIError('FORBIDDEN', {
			message: 'Access denied: allowlist not configured',
		});
	}
}

/**
 * Check if email/password auth should be enabled.
 * Only allowed in test environment with localhost URL.
 */
function isEmailPasswordAuthEnabled(env?: Env): boolean {
	if (!env) return false;
	if (env.ENABLE_TEST_EMAIL_PASSWORD_AUTH !== '1') return false;
	if (!env.BETTER_AUTH_URL?.startsWith('http://localhost')) return false;
	return true;
}

// Single auth configuration that handles both CLI and runtime scenarios
function createAuth(env?: Env, cf?: IncomingRequestCfProperties) {
	// Use actual DB for runtime, empty object for CLI
	const db = env ? drizzle(env.DB, { schema }) : ({} as any);

	// Email/password auth is only enabled in test environment (§5.2)
	const emailPasswordEnabled = isEmailPasswordAuthEnabled(env);

	// Preview-only cookie config (ADR 0019): SameSite=None for cross-site pages.dev → workers.dev
	const isPreview = isPreviewEnv(env);
	const previewCookieConfig = isPreview
		? {
				advanced: {
					useSecureCookies: true,
					defaultCookieAttributes: {
						secure: true,
						sameSite: 'none' as const,
					},
				},
			}
		: {};

	return betterAuth({
		...withCloudflare(
			{
				autoDetectIpAddress: true,
				cf: cf || {},
				d1: env
					? {
							db,
						}
					: undefined,
			},
			{
				appName: 'append',
				secret: env?.BETTER_AUTH_SECRET,
				baseURL: env?.BETTER_AUTH_URL,
				basePath: '/auth',
				trustedOrigins: getAllowedOrigins(env),
				socialProviders: {
					google: {
						clientId: env?.GOOGLE_CLIENT_ID || '',
						clientSecret: env?.GOOGLE_CLIENT_SECRET || '',
					},
				},
				// Email/password auth for test environment only (§5.2)
				...(emailPasswordEnabled
					? {
							emailAndPassword: {
								enabled: true,
							},
						}
					: {}),
				// Preview cookie configuration (ADR 0019)
				...previewCookieConfig,
			}
		),
		// Allowlist enforcement (ADR 0001)
		databaseHooks: env
			? {
					// Check on user creation (first sign-in)
					user: {
						create: {
							before: async (user) => {
								assertAllowlistConfigured(env);
								if (!user.email) {
									throw new APIError('FORBIDDEN', {
										message: 'Access denied: email not provided',
									});
								}

								// For first sign-in, we only have email (sub is in account, created after)
								// If ALLOWED_SUB is set, we defer to account.create hook
								// If only ALLOWED_EMAIL is set, check here
								if (!env.ALLOWED_SUB && env.ALLOWED_EMAIL) {
									if (!isUserAllowed(env, user.email)) {
										throw new APIError('FORBIDDEN', {
											message: 'Access denied: not on allowlist',
										});
									}
								}
							},
							// Seed default buckets after user creation (Phase 5B)
							after: async (user) => {
								const bucketValues = DEFAULT_BUCKETS.map((b) => ({
									id: crypto.randomUUID(),
									userId: user.id,
									slug: b.slug,
									name: b.name,
									description: b.description,
									color: null,
									order: b.order,
								}));

								await db.insert(bucket).values(bucketValues);
							},
						},
					},
					// Check sub on account creation (for ALLOWED_SUB)
					account: {
						create: {
							// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multi-provider allowlist checks
							before: async (account) => {
								assertAllowlistConfigured(env);

								// Google: enforce sub allowlist if configured (ADR 0001 primary rule)
								if (account.providerId === 'google' && env.ALLOWED_SUB) {
									if (!account.accountId || account.accountId !== env.ALLOWED_SUB) {
										throw new APIError('FORBIDDEN', {
											message: 'Access denied: not on allowlist',
										});
									}
									return;
								}

								// E2E provider (ADR 0019): bypass allowlist check here since
								// the E2E endpoint performs its own validation before reaching this point
								if (account.providerId === 'e2e') {
									return;
								}

								// Non-Google providers: sub allowlist does not apply.
								// Require ALLOWED_EMAIL match (fail closed if missing).
								if (!env.ALLOWED_EMAIL) {
									throw new APIError('FORBIDDEN', {
										message: 'Access denied: email allowlist required',
									});
								}

								const userRow = await db.query.user.findFirst({
									columns: { email: true },
									where: (u: typeof user) => eq(u.id, account.userId),
								});

								if (!userRow?.email || !isEmailAllowed(env, userRow.email)) {
									throw new APIError('FORBIDDEN', {
										message: 'Access denied: not on allowlist',
									});
								}
							},
						},
					},
				}
			: undefined,
		// Only add database adapter for CLI schema generation (when env is not provided)
		...(env
			? {}
			: {
					database: drizzleAdapter({} as D1Database, {
						provider: 'sqlite',
					}),
				}),
	});
}

// Export for CLI schema generation
export const auth = createAuth();

// Export for runtime usage
export { createAuth, getAllowedOrigins, isPreviewEnv };

export type Auth = ReturnType<typeof createAuth>;

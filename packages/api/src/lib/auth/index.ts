import type { D1Database, IncomingRequestCfProperties } from "@cloudflare/workers-types";
import { betterAuth } from "better-auth";
import { withCloudflare } from "better-auth-cloudflare";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import { APIError } from "better-auth/api";
import { schema } from "../../db";

type Env = {
	DB: D1Database;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	// Allowlist (ADR 0001)
	ALLOWED_SUB?: string;
	ALLOWED_EMAIL?: string;
};

/**
 * Check if a user is allowed based on ADR 0001:
 * - Primary: Google sub (stable per account)
 * - Fallback: email (case-insensitive), only if sub not configured
 * - Fail closed: deny if no allowlist match
 */
function isUserAllowed(env: Env, userEmail: string, accountId?: string): boolean {
	// Primary check: sub (if configured)
	if (env.ALLOWED_SUB) {
		return accountId === env.ALLOWED_SUB;
	}

	// Fallback check: email (if configured)
	if (env.ALLOWED_EMAIL) {
		return userEmail.toLowerCase() === env.ALLOWED_EMAIL.toLowerCase();
	}

	// Fail closed: no allowlist configured
	return false;
}

function isEmailAllowed(env: Env, userEmail: string): boolean {
	if (!env.ALLOWED_EMAIL) return false;
	return userEmail.toLowerCase() === env.ALLOWED_EMAIL.toLowerCase();
}

function assertAllowlistConfigured(env: Env): void {
	if (!env.ALLOWED_SUB && !env.ALLOWED_EMAIL) {
		throw new APIError("FORBIDDEN", {
			message: "Access denied: allowlist not configured",
		});
	}
}

// Single auth configuration that handles both CLI and runtime scenarios
function createAuth(env?: Env, cf?: IncomingRequestCfProperties) {
	// Use actual DB for runtime, empty object for CLI
	const db = env ? drizzle(env.DB, { schema }) : ({} as any);

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
				appName: "append",
				secret: env?.BETTER_AUTH_SECRET,
				baseURL: env?.BETTER_AUTH_URL,
				basePath: "/auth",
				trustedOrigins: ["http://localhost:5173", "https://append.tindev.dev"],
				socialProviders: {
					google: {
						clientId: env?.GOOGLE_CLIENT_ID || "",
						clientSecret: env?.GOOGLE_CLIENT_SECRET || "",
					},
				},
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
									throw new APIError("FORBIDDEN", {
										message: "Access denied: email not provided",
									});
								}

								// For first sign-in, we only have email (sub is in account, created after)
								// If ALLOWED_SUB is set, we defer to account.create hook
								// If only ALLOWED_EMAIL is set, check here
								if (!env.ALLOWED_SUB && env.ALLOWED_EMAIL) {
									if (!isUserAllowed(env, user.email)) {
										throw new APIError("FORBIDDEN", {
											message: "Access denied: not on allowlist",
										});
									}
								}
							},
						},
					},
					// Check sub on account creation (for ALLOWED_SUB)
					account: {
						create: {
							before: async (account) => {
								assertAllowlistConfigured(env);

								// Google: enforce sub allowlist if configured (ADR 0001 primary rule)
								if (account.providerId === "google" && env.ALLOWED_SUB) {
									if (!account.accountId || account.accountId !== env.ALLOWED_SUB) {
										throw new APIError("FORBIDDEN", {
											message: "Access denied: not on allowlist",
										});
									}
									return;
								}

								// Non-Google providers: sub allowlist does not apply.
								// Require ALLOWED_EMAIL match (fail closed if missing).
								if (!env.ALLOWED_EMAIL) {
									throw new APIError("FORBIDDEN", {
										message: "Access denied: email allowlist required",
									});
								}

								const userRow = await db.query.user.findFirst({
									columns: { email: true },
									where: (u, { eq }) => eq(u.id, account.userId),
								});

								if (!userRow?.email || !isEmailAllowed(env, userRow.email)) {
									throw new APIError("FORBIDDEN", {
										message: "Access denied: not on allowlist",
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
						provider: "sqlite",
					}),
				}),
	});
}

// Export for CLI schema generation
export const auth = createAuth();

// Export for runtime usage
export { createAuth };

export type Auth = ReturnType<typeof createAuth>;

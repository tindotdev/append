/**
 * Environment bindings for Cloudflare Workers.
 */

export type Bindings = {
	// Database
	DB: D1Database;

	// AI Gateway
	CF_ACCOUNT_ID: string;
	CF_AIG_TOKEN: string;
	AI_GATEWAY_ID: string;

	// Suggestion provider: 'openai' | 'stub' | 'disabled'
	SUGGESTIONS_PROVIDER?: string;

	// Auth
	ALLOWED_EMAIL?: string;
	ALLOWED_SUB?: string;
	BETTER_AUTH_SECRET?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
};

export type Variables = {
	userId: string;
};

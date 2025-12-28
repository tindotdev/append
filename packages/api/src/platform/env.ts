/**
 * Environment bindings for Cloudflare Workers.
 */

/**
 * Cloudflare Secrets Store binding interface.
 * @see https://developers.cloudflare.com/secrets-store/integrations/workers/
 */
export interface SecretsStoreSecret {
	get(): Promise<string>;
}

export type Bindings = {
	// Database
	DB: D1Database;

	// AI Gateway
	CF_ACCOUNT_ID: string;
	AI_GATEWAY_ID: string;

	// Secrets Store (async secrets)
	OPENAI_API_KEY: SecretsStoreSecret;

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

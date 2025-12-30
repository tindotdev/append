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

/**
 * Check if a value is a Secrets Store binding (has .get() method).
 * In local dev with .dev.vars, secrets come as plain strings.
 * In production with Secrets Store, they're objects with .get().
 */
export function isSecretsStoreBinding(value: unknown): value is SecretsStoreSecret {
	return typeof value === 'object' && value !== null && 'get' in value && typeof (value as SecretsStoreSecret).get === 'function';
}

/**
 * Get a secret value, handling both:
 * - Plain strings from .dev.vars (local development)
 * - SecretsStoreSecret objects from Secrets Store (production)
 */
export async function getSecretValue(secret: string | SecretsStoreSecret | undefined): Promise<string | undefined> {
	if (!secret) return undefined;
	if (typeof secret === 'string') return secret;
	if (isSecretsStoreBinding(secret)) return secret.get();
	return undefined;
}

export type Bindings = {
	// Database
	DB: D1Database;

	// AI Gateway
	CF_ACCOUNT_ID: string;
	AI_GATEWAY_ID: string;
	CF_AIG_TOKEN?: string;

	// OpenAI API key - either:
	// - Plain string from .dev.vars (local development)
	// - SecretsStoreSecret from Secrets Store (production)
	OPENAI_API_KEY?: string | SecretsStoreSecret;

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

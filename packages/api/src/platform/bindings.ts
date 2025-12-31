import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { schema } from '../db';

export type Bindings = {
	// Database
	DB: D1Database;

	// R2 Object Storage
	IMPORT_FILES: R2Bucket;

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
	BETTER_AUTH_URL?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	ENABLE_TEST_EMAIL_PASSWORD_AUTH?: string;
};

export type Variables = {
	userId: string;
	db: DrizzleD1Database<typeof schema>;
};

export interface SecretsStoreSecret {
	get(): Promise<string>;
}

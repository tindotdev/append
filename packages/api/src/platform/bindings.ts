import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { schema } from '../db';

export type Bindings = {
	// Database
	DB: D1Database;

	// R2 Object Storage
	IMPORT_FILES: R2Bucket;

	// Rate Limiting (distributed via CF Rate Limiting API)
	INGEST_RATE_LIMITER: RateLimit;

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

	// E2E Auth Bootstrap (ADR 0019)
	APP_ENV?: string; // 'production' | 'preview' | 'local' | 'test'
	E2E_AUTH_SECRET?: string;
	E2E_AUTH_SECRET_OLD?: string; // For zero-downtime secret rotation
	E2E_AUTH_EMAIL?: string;

	// Extension Security - Allowlist of Chrome extension IDs that can access /events/* endpoints
	ALLOWED_EXTENSION_IDS?: string; // Comma-separated list of 32-char extension IDs

	// Events export tuning
	// NOTE: Values are strings in CF bindings; parse as integers in code.
	EVENTS_EXPORT_PAGE_SIZE?: string; // default: 1000
	EVENTS_EXPORT_MAX_TOTAL_ROWS?: string; // default: 100000
};

export type Variables = {
	userId: string;
	db: DrizzleD1Database<typeof schema>;
};

export interface SecretsStoreSecret {
	get(): Promise<string>;
}

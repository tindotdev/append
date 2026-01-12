/**
 * Environment bindings for Cloudflare Workers.
 */

import type { SecretsStoreSecret } from './bindings';

/**
 * Cloudflare Secrets Store binding interface.
 * @see https://developers.cloudflare.com/secrets-store/integrations/workers/
 */
export type { Bindings, SecretsStoreSecret, Variables } from './bindings';

/**
 * Check if a value is a Secrets Store binding (has .get() method).
 * In local dev with .dev.vars, secrets come as plain strings.
 * In production with Secrets Store, they're objects with .get().
 */
export function isSecretsStoreBinding(value: unknown): value is SecretsStoreSecret {
	return typeof value === 'object' && value !== null && 'get' in value && typeof (value as SecretsStoreSecret).get === 'function';
}

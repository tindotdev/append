import { IDENTITY_PARAMS_SET } from '@append/contracts/url-normalization';

/**
 * Normalize URL for artifact identity hashing.
 *
 * Hybrid approach (per PR feedback):
 * - Preserves common identity parameters (id, slug, sku, etc.) to distinguish different content
 * - Strips tracking/analytics parameters (utm_*, fbclid, etc.) to reduce cardinality
 * - Groups related content (e.g., different sorts/views of the same item)
 *
 * Trade-offs:
 * - ✅ Preserves granularity for query-driven content (blog posts, product pages, search results)
 * - ✅ Reduces tracking noise (utm params, click IDs, etc.)
 * - ⚠️ Identity param list is a heuristic and may need domain-specific tuning
 *
 * Future consideration: Make identity param list configurable per-domain or per-user.
 *
 * Normalization rules:
 * - Strip fragment (#...)
 * - Preserve only identity query parameters (see @append/contracts/url-normalization)
 * - Lowercase hostname
 * - Preserve path
 */
export function normalizeUrlForHash(url: URL): URL {
	const normalized = new URL(url.toString());
	normalized.hash = '';

	// Preserve only identity parameters, strip tracking/analytics params
	const identityParams = new URLSearchParams();
	for (const [key, value] of url.searchParams) {
		if (IDENTITY_PARAMS_SET.has(key.toLowerCase())) {
			identityParams.set(key, value);
		}
	}
	normalized.search = identityParams.toString();

	normalized.hostname = normalized.hostname.toLowerCase();
	return normalized;
}

export async function sha256Hex(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export async function computeUrlHash(url: URL): Promise<string> {
	return sha256Hex(url.toString());
}

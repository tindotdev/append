/**
 * Common query parameters that represent content identity (not tracking/analytics).
 * These are preserved during URL normalization to distinguish different content
 * on the same path (e.g., /blog/post?id=1 vs /blog/post?id=2).
 *
 * Includes:
 * - Content identifiers: id, slug, sku, article, post, product, item, name
 * - Versioning: v, version, variant
 * - Search/filters: q, query, search, s, filter, tag, category
 *
 * Intentionally EXCLUDED:
 * - Pagination (page, p, offset): Treated as navigation within same artifact to avoid
 *   fragmenting sessions. Example: search?q=python&page=1 and search?q=python&page=2
 *   are considered the SAME artifact for better sessionization.
 * - Analytics/tracking (utm_*, fbclid, gclid, etc.): Not content-related.
 *
 * IMPORTANT: This is a cross-client contract. All clients (extension, web, future mobile)
 * MUST use this same list to ensure consistent URL hashing for artifact identity.
 * Changes to this list affect historical url_hash consistency.
 */
export const IDENTITY_PARAMS = [
	'id',
	'slug',
	'sku',
	'article',
	'post',
	'product',
	'item',
	'name',
	'v',
	'version',
	'variant',
	'q',
	'query',
	'search',
	's',
	'filter',
	'tag',
	'category',
] as const;

/**
 * Set version of IDENTITY_PARAMS for efficient lookup during normalization.
 */
export const IDENTITY_PARAMS_SET: Set<string> = new Set(IDENTITY_PARAMS);

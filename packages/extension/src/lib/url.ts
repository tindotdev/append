/**
 * Normalize URL for artifact identity hashing.
 *
 * IMPORTANT: Query strings are intentionally stripped (per design.md) to reduce
 * artifact cardinality in the MVP. This means different articles on the same path
 * (e.g., /blog/post?id=1 vs /blog/post?id=2) will be treated as the SAME artifact.
 *
 * Trade-offs:
 * - ✅ Reduces database/storage overhead (fewer unique artifacts)
 * - ✅ Groups related content (e.g., different Reddit comment sorts on same post)
 * - ❌ Loses granularity for query-driven content (blog posts, product pages, search results)
 *
 * Future consideration: Make query string inclusion configurable per-domain or per-user.
 *
 * Normalization rules:
 * - Strip fragment (#...)
 * - Strip query string (?...)
 * - Lowercase hostname
 * - Preserve path
 */
export function normalizeUrlForHash(url: URL): URL {
	const normalized = new URL(url.toString());
	normalized.hash = '';
	normalized.search = '';
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

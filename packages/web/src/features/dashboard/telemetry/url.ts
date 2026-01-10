import { IDENTITY_PARAMS_SET } from '@append/contracts/url-normalization';

export function isHttpUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch {
		return false;
	}
}

/**
 * Normalize URL for artifact identity hashing.
 *
 * Hybrid approach (per PR feedback):
 * - Preserves common identity parameters (id, slug, sku, etc.) to distinguish different content
 * - Strips tracking/analytics parameters (utm_*, fbclid, etc.) to reduce cardinality
 * - Groups related content (e.g., different sorts/views of the same item)
 *
 * IMPORTANT: Must match extension implementation for consistent hashing across clients.
 * Identity params are defined in @append/contracts/url-normalization.
 */
export function normalizeUrlForHash(url: string): string {
	const parsed = new URL(url);
	parsed.hash = '';

	// Preserve only identity parameters, strip tracking/analytics params
	const identityParams = new URLSearchParams();
	for (const [key, value] of parsed.searchParams) {
		if (IDENTITY_PARAMS_SET.has(key.toLowerCase())) {
			identityParams.set(key, value);
		}
	}
	const queryString = identityParams.toString();

	parsed.hostname = parsed.hostname.toLowerCase();
	return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}${queryString ? `?${queryString}` : ''}`;
}

export async function sha256Hex(input: string): Promise<string> {
	// `crypto.subtle` is not available in some test/non-secure contexts.
	// Fallback keeps the prototype functional without pulling in a hashing dependency.
	if (!globalThis.crypto?.subtle?.digest) {
		let h = 2166136261;
		for (let i = 0; i < input.length; i += 1) {
			h ^= input.charCodeAt(i);
			h = Math.imul(h, 16777619);
		}
		return h.toString(16).padStart(64, '0');
	}
	const data = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest('SHA-256', data);
	const bytes = new Uint8Array(digest);
	let hex = '';
	for (const b of bytes) hex += b.toString(16).padStart(2, '0');
	return hex;
}

export async function urlToArtifact(url: string): Promise<{ url_hash: string; host: string; path_hint?: string }> {
	const parsed = new URL(url);
	const normalized = normalizeUrlForHash(url);
	const url_hash = await sha256Hex(normalized);
	const path_hint = parsed.pathname.length > 1 ? parsed.pathname : undefined;
	return { url_hash, host: parsed.hostname.toLowerCase(), path_hint };
}

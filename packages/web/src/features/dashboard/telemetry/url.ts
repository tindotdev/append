function stripFragment(url: URL) {
	url.hash = '';
}

function stripQuery(url: URL) {
	url.search = '';
}

export function isHttpUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch {
		return false;
	}
}

export function normalizeUrlForHash(url: string): string {
	const parsed = new URL(url);
	stripFragment(parsed);
	stripQuery(parsed);
	parsed.hostname = parsed.hostname.toLowerCase();
	return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
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

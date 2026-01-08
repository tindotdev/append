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

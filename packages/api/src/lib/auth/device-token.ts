const TOKEN_BYTES = 32;
export const DEVICE_TOKEN_PREFIX = 'apdt_';

function base64UrlEncode(bytes: Uint8Array): string {
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	const base64 = btoa(binary);
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function generateDeviceToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
	return `${DEVICE_TOKEN_PREFIX}${base64UrlEncode(bytes)}`;
}

export async function sha256Hex(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export function parseBearerToken(authHeader: string | undefined | null): string | null {
	if (!authHeader) return null;
	const match = authHeader.match(/^Bearer\s+(.+)$/i);
	if (!match) return null;
	const token = match[1]?.trim();
	if (!token) return null;
	// Validate token prefix for defense-in-depth
	if (!token.startsWith(DEVICE_TOKEN_PREFIX)) return null;
	return token;
}

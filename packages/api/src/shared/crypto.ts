/**
 * Cryptographic utilities using Web Crypto API.
 */

/**
 * Generate a UUID v4 using the Web Crypto API.
 */
export function generateUUID(): string {
	return crypto.randomUUID();
}

/**
 * Compute SHA-256 hash of a string and return as hex.
 */
export async function sha256Hex(input: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(input);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate that a string is a valid UUID (RFC 4122 format).
 */
export function isValidUUID(value: string): boolean {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	return uuidRegex.test(value);
}

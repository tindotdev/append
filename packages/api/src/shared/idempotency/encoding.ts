/**
 * Base64url encoding/decoding utilities for idempotency result references.
 */

/**
 * Encode a string to base64url (no padding).
 */
export function toBase64Url(input: string): string {
	const encoder = new TextEncoder();
	const bytes = encoder.encode(input);
	const base64 = btoa(String.fromCharCode(...bytes));
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decode a base64url string to a regular string.
 */
export function fromBase64Url(input: string): string {
	// Restore standard base64 characters
	let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
	// Add padding if needed
	while (base64.length % 4 !== 0) {
		base64 += '=';
	}
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new TextDecoder().decode(bytes);
}

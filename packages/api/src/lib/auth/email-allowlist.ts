/**
 * Shared allowlist email matcher (supports plus-addressing wildcards).
 */

/**
 * Check if an email matches an allowlist pattern.
 * Supports wildcard pattern for plus-addressing: `prefix+*@domain`
 * Examples:
 *   - `e2e-bot+*@append.test` matches `e2e-bot+pr-123@append.test`
 *   - `test@example.com` matches `test@example.com` (exact match)
 */
export function emailMatchesAllowlist(email: string, allowlistPattern: string): boolean {
	const emailLower = email.toLowerCase();
	const patternLower = allowlistPattern.toLowerCase();

	// Check for wildcard pattern: prefix+*@domain
	if (patternLower.includes('+*@')) {
		const [prefix, domain] = patternLower.split('+*@');
		// Email must start with "prefix+" and end with "@domain"
		return emailLower.startsWith(prefix + '+') && emailLower.endsWith('@' + domain);
	}

	// Exact match fallback
	return emailLower === patternLower;
}

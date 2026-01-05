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
		const prefixWithPlus = `${prefix}+`;
		const atDomain = `@${domain}`;

		// Email must start with "prefix+" and end with "@domain"
		if (!emailLower.startsWith(prefixWithPlus) || !emailLower.endsWith(atDomain)) {
			return false;
		}

		// Security: Ensure non-empty suffix between + and @ to prevent
		// matching unintended emails like "e2e-bot+@append.test"
		const suffix = emailLower.slice(prefixWithPlus.length, emailLower.length - atDomain.length);
		if (suffix.length === 0) {
			return false;
		}

		return true;
	}

	// Exact match fallback
	return emailLower === patternLower;
}

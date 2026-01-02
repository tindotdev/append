/**
 * Shared query parameter helpers.
 */

/**
 * Parse the common history `limit` query param.
 * Mirrors existing inline behavior for import/export history routes.
 */
export function parseHistoryLimit(limitParam: string | undefined): number {
	return limitParam ? Math.min(Number.parseInt(limitParam, 10), 50) : 20;
}

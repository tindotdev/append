/**
 * Monthly window utilities for LLM budget tracking (ADR 0026).
 * Uses UTC for all calculations.
 */

/**
 * Get the start timestamp and duration of the current UTC month window.
 * Window starts on the 1st of the month at 00:00:00.000 UTC.
 */
export function getUtcMonthWindow(nowMs: number): { windowStartMs: number; windowMs: number } {
	const date = new Date(nowMs);

	// Start of current month (UTC)
	const windowStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));

	// Start of next month (UTC)
	const nextMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));

	const windowStartMs = windowStart.getTime();
	const windowMs = nextMonth.getTime() - windowStartMs;

	return { windowStartMs, windowMs };
}

/**
 * Check if a budget window has expired and needs rotation.
 */
export function isWindowExpired(windowStartMs: number, windowMs: number, nowMs: number): boolean {
	return nowMs >= windowStartMs + windowMs;
}

/**
 * Get the reset timestamp for the next window (for error messages).
 */
export function getNextWindowResetMs(windowStartMs: number, windowMs: number): number {
	return windowStartMs + windowMs;
}

/**
 * Format a timestamp as ISO 8601 for API responses.
 */
export function formatResetTime(resetMs: number): string {
	return new Date(resetMs).toISOString();
}

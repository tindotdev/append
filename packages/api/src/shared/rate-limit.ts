/**
 * Simple in-memory rate limiter for event ingestion.
 *
 * IMPORTANT: This is a basic implementation suitable for single-worker deployments.
 * For production multi-worker scenarios, consider:
 * - Cloudflare Durable Objects for distributed rate limiting
 * - Cloudflare Workers Rate Limiting API
 * - External rate limiting service (e.g., Redis)
 *
 * Limits are per-user to prevent malicious or buggy clients from overwhelming the API.
 */

type RateLimitEntry = {
	count: number;
	windowStart: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_EVENTS_PER_WINDOW = 1000;

/**
 * Check if a user has exceeded the rate limit.
 * Returns true if the request should be allowed, false if rate limited.
 */
export function checkRateLimit(userId: string, eventCount: number): { allowed: boolean; remaining: number } {
	const now = Date.now();
	const key = `user:${userId}`;

	const entry = rateLimitStore.get(key);

	// Clean up old entries (simple garbage collection)
	if (entry && now - entry.windowStart > WINDOW_MS) {
		rateLimitStore.delete(key);
	}

	const current = entry && now - entry.windowStart <= WINDOW_MS ? entry : { count: 0, windowStart: now };

	const newCount = current.count + eventCount;

	if (newCount > MAX_EVENTS_PER_WINDOW) {
		return { allowed: false, remaining: Math.max(0, MAX_EVENTS_PER_WINDOW - current.count) };
	}

	rateLimitStore.set(key, { count: newCount, windowStart: current.windowStart });

	return { allowed: true, remaining: MAX_EVENTS_PER_WINDOW - newCount };
}

/**
 * Periodic cleanup of expired rate limit entries.
 * Call this periodically (e.g., every 5 minutes) to prevent memory leaks.
 */
export function cleanupRateLimitStore(): void {
	const now = Date.now();
	for (const [key, entry] of rateLimitStore.entries()) {
		if (now - entry.windowStart > WINDOW_MS * 2) {
			rateLimitStore.delete(key);
		}
	}
}

/**
 * Distributed rate limiting via Cloudflare Rate Limiting API.
 *
 * Uses CF's native rate limiting binding which is:
 * - Distributed across all Workers isolates (per CF location)
 * - Fast (cached locally, no network hop)
 * - Eventually consistent (permissive, not exact)
 *
 * Trade-off: Limits are per-batch, not per-event. Each limit() call = 1 batch.
 * With client BATCH_SIZE=200 and limit=100/min, max throughput is ~20k events/min.
 * This is intentionally lenient; goal is abuse prevention, not precise metering.
 *
 * @see https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
 */

export type RateLimitResult = {
	allowed: boolean;
};

/**
 * Check if a user has exceeded the rate limit for event ingestion.
 *
 * @param rateLimiter - The CF Rate Limiting binding
 * @param userId - User ID to rate limit
 * @returns Whether the request is allowed
 */
export async function checkRateLimit(rateLimiter: RateLimit, userId: string): Promise<RateLimitResult> {
	const { success } = await rateLimiter.limit({ key: `ingest:${userId}` });
	return { allowed: success };
}

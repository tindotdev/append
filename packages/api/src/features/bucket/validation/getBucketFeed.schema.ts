/**
 * Valibot schema for GET /api/bucket/:slug query parameters.
 */

import * as v from 'valibot';
import { fromBase64Url, toBase64Url } from '../../../shared/idempotency/encoding';

/**
 * Default and limits for pagination.
 */
export const DEFAULT_LIMIT = 50;
export const MIN_LIMIT = 1;
export const MAX_LIMIT = 200;

/**
 * Custom transform that parses string to integer, failing if NaN.
 */
const parseIntTransform = v.pipe(
	v.string(),
	v.rawTransform(({ dataset, addIssue, NEVER }) => {
		const parsed = parseInt(dataset.value, 10);
		if (Number.isNaN(parsed)) {
			addIssue({ message: 'limit must be an integer' });
			return NEVER;
		}
		return parsed;
	})
);

/**
 * Schema for bucket feed query parameters.
 */
export const GetBucketFeedParamsSchema = v.object({
	limit: v.optional(
		v.pipe(
			parseIntTransform,
			v.integer('limit must be an integer'),
			v.minValue(MIN_LIMIT, `limit must be between ${MIN_LIMIT} and ${MAX_LIMIT}`),
			v.maxValue(MAX_LIMIT, `limit must be between ${MIN_LIMIT} and ${MAX_LIMIT}`)
		),
		String(DEFAULT_LIMIT)
	),
	cursor: v.optional(v.string()),
});

/**
 * Type for validated bucket feed query.
 */
export type GetBucketFeedParams = v.InferOutput<typeof GetBucketFeedParamsSchema>;

/**
 * Cursor for pagination.
 * Encodes (createdAt, termId) tuple for stable cursor-based pagination.
 */
export interface BucketFeedCursor {
	createdAt: number; // milliseconds since epoch
	termId: string;
}

/**
 * Encode a cursor to a base64url string (no padding).
 */
export function encodeCursor(cursor: BucketFeedCursor): string {
	const json = JSON.stringify(cursor);
	return toBase64Url(json);
}

/**
 * Decode a cursor from a base64url string.
 */
export function decodeCursor(encoded: string): BucketFeedCursor | null {
	try {
		const json = fromBase64Url(encoded);
		const parsed = JSON.parse(json);

		if (typeof parsed.createdAt !== 'number' || typeof parsed.termId !== 'string') {
			return null;
		}

		return parsed as BucketFeedCursor;
	} catch {
		return null;
	}
}

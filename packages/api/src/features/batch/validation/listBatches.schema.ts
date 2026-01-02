/**
 * Valibot schema for GET /api/batch (list batches) query parameters.
 */

import * as v from 'valibot';
import { fromBase64Url, toBase64Url } from '../../../shared/idempotency/encoding';

/**
 * Default and limits for pagination.
 */
export const DEFAULT_LIMIT = 20;
export const MIN_LIMIT = 1;
export const MAX_LIMIT = 100;

/**
 * Schema for list batches query parameters.
 */
export const ListBatchesSchema = v.object({
	limit: v.optional(
		v.pipe(
			v.string(),
			v.transform((s) => parseInt(s, 10)),
			v.number(),
			v.integer(),
			v.minValue(MIN_LIMIT, `limit must be at least ${MIN_LIMIT}`),
			v.maxValue(MAX_LIMIT, `limit must be at most ${MAX_LIMIT}`)
		),
		String(DEFAULT_LIMIT)
	),
	cursor: v.optional(v.string()),
});

/**
 * Type for validated list batches query.
 */
export type ListBatchesInput = v.InferOutput<typeof ListBatchesSchema>;

/**
 * Cursor for pagination.
 * Encodes (createdAt, id) tuple for stable cursor-based pagination.
 */
export interface PaginationCursor {
	createdAt: number; // milliseconds since epoch
	id: string;
}

/**
 * Encode a cursor to a base64url string.
 */
export function encodeCursor(cursor: PaginationCursor): string {
	const json = JSON.stringify(cursor);
	return toBase64Url(json);
}

/**
 * Decode a cursor from a base64url string.
 */
export function decodeCursor(encoded: string): PaginationCursor | null {
	try {
		const json = fromBase64Url(encoded);
		const parsed = JSON.parse(json);

		if (typeof parsed.createdAt !== 'number' || typeof parsed.id !== 'string') {
			return null;
		}

		return parsed as PaginationCursor;
	} catch {
		return null;
	}
}

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
 * Valid batch statuses for filtering.
 */
export const BATCH_STATUSES = ['captured', 'suggested', 'accepted'] as const;
export type BatchStatusFilter = (typeof BATCH_STATUSES)[number];

/**
 * Valid sort fields.
 */
export const SORT_FIELDS = ['created', 'candidateCount', 'acceptanceRate'] as const;
export type SortField = (typeof SORT_FIELDS)[number];

/**
 * Valid sort orders.
 */
export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

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
	// Search filter: searches batch sample terms
	search: v.optional(v.pipe(v.string(), v.maxLength(200, 'search query too long'))),
	// Status filter: filter by batch status
	status: v.optional(v.picklist(BATCH_STATUSES, 'invalid status filter')),
	// Error filter: filter batches with errors
	hasErrors: v.optional(
		v.pipe(
			v.string(),
			v.transform((s) => s === 'true')
		)
	),
	// Sort field
	sortBy: v.optional(v.picklist(SORT_FIELDS, 'invalid sort field')),
	// Sort order
	sortOrder: v.optional(v.picklist(SORT_ORDERS, 'invalid sort order')),
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

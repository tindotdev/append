/**
 * Valibot schemas for import endpoints.
 */

import * as v from 'valibot';

// =============================================================================
// Upload endpoint: POST /api/import/upload
// =============================================================================

/**
 * After FilePond uploads, we receive file metadata.
 * The actual file handling is done via multipart form data parsing.
 */
export const UploadImportResponseSchema = v.object({
	importId: v.string(),
	files: v.array(
		v.object({
			filename: v.string(),
			r2Key: v.string(),
			size: v.number(),
		})
	),
});

export type UploadImportResponse = v.InferOutput<typeof UploadImportResponseSchema>;

// =============================================================================
// Preview endpoint: POST /api/import/preview
// =============================================================================

export const PreviewImportSchema = v.object({
	importId: v.pipe(v.string(), v.uuid('importId must be a valid UUID')),
});

export type PreviewImportInput = v.InferOutput<typeof PreviewImportSchema>;

export interface ParsedFilePreview {
	filename: string;
	r2Key: string;
	suggestedBucketSlug: string | null;
	entries: Array<{
		term: string;
		definition: string;
		lineNumber: number;
		isInbox: boolean;
	}>;
	warnings: Array<{
		lineNumber: number;
		message: string;
	}>;
}

export interface PreviewImportResponse {
	importId: string;
	parsedFiles: ParsedFilePreview[];
	stats: {
		totalEntries: number;
		entriesWithDefinition: number;
		inboxEntries: number;
		existingTerms: number;
		newTerms: number;
	};
	existingBuckets: Array<{
		id: string;
		slug: string;
		name: string;
	}>;
}

// =============================================================================
// Commit endpoint: POST /api/import/commit
// =============================================================================

// Accept both UUID format (with hyphens) and 32-char hex (legacy format)
const bucketIdSchema = v.pipe(
	v.string(),
	v.minLength(1, 'bucketId is required'),
	v.regex(/^[a-f0-9-]{32,36}$/i, 'bucketId must be a valid identifier')
);

export const BucketMappingSchema = v.object({
	r2Key: v.string(),
	bucketId: bucketIdSchema,
});

export const CommitImportSchema = v.object({
	clientRequestId: v.pipe(v.string(), v.uuid('clientRequestId must be a valid UUID')),
	importId: v.pipe(v.string(), v.uuid('importId must be a valid UUID')),
	bucketMappings: v.array(BucketMappingSchema),
	createMissingBuckets: v.optional(v.boolean(), true),
});

export type BucketMapping = v.InferOutput<typeof BucketMappingSchema>;
export type CommitImportInput = v.InferOutput<typeof CommitImportSchema>;

export interface CommitImportResponse {
	status: 'done';
	stats: {
		termCreatedCount: number;
		termSenseCreatedCount: number;
		bucketCreatedCount: number;
		flaggedCount: number;
		skippedCount: number;
	};
	bucketsCreated: Array<{
		id: string;
		slug: string;
		name: string;
	}>;
}

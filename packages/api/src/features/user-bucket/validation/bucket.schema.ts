/**
 * Validation schemas for bucket CRUD operations.
 */

import * as v from 'valibot';
import { MAX_BUCKETS_PER_USER } from '../../../db/default-buckets';

// =============================================================================
// Shared schemas
// =============================================================================

/** Bucket slug: lowercase letters, numbers, hyphens. 2-32 chars. */
export const BucketSlugSchema = v.pipe(
	v.string('Slug must be a string'),
	v.minLength(2, 'Slug must be at least 2 characters'),
	v.maxLength(32, 'Slug must be at most 32 characters'),
	v.regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
);

/** Bucket name: 1-64 chars. */
export const BucketNameSchema = v.pipe(
	v.string('Name must be a string'),
	v.minLength(1, 'Name is required'),
	v.maxLength(64, 'Name must be at most 64 characters')
);

/** Bucket description: 0-256 chars. */
export const BucketDescriptionSchema = v.pipe(
	v.string('Description must be a string'),
	v.maxLength(256, 'Description must be at most 256 characters')
);

/** Bucket color: optional hex color. */
export const BucketColorSchema = v.optional(
	v.pipe(v.string('Color must be a string'), v.regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color (#RRGGBB)'))
);

// =============================================================================
// Create bucket schema
// =============================================================================

export const CreateBucketSchema = v.object({
	slug: BucketSlugSchema,
	name: BucketNameSchema,
	description: BucketDescriptionSchema,
	color: BucketColorSchema,
});

export type CreateBucketInput = v.InferOutput<typeof CreateBucketSchema>;

// =============================================================================
// Update bucket schema
// =============================================================================

export const UpdateBucketSchema = v.object({
	name: v.optional(BucketNameSchema),
	description: v.optional(BucketDescriptionSchema),
	color: v.optional(v.nullable(BucketColorSchema)),
});

export type UpdateBucketInput = v.InferOutput<typeof UpdateBucketSchema>;

// =============================================================================
// Reorder buckets schema
// =============================================================================

export const ReorderBucketsSchema = v.object({
	/** Ordered array of bucket IDs representing the new order. */
	bucketIds: v.pipe(
		v.array(v.string('Bucket ID must be a string'), 'bucketIds must be an array'),
		v.minLength(1, 'bucketIds must contain at least one ID'),
		v.maxLength(MAX_BUCKETS_PER_USER, `bucketIds must contain at most ${MAX_BUCKETS_PER_USER} IDs`)
	),
});

export type ReorderBucketsInput = v.InferOutput<typeof ReorderBucketsSchema>;

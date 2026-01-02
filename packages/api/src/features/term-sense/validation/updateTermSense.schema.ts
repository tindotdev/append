/**
 * Valibot schema for PATCH /api/term-sense/:id request body.
 */

import * as v from 'valibot';

/**
 * Maximum length for sense text.
 */
export const MAX_SENSE_TEXT_LENGTH = 500;

/**
 * Maximum length for bucket slug.
 */
export const MAX_BUCKET_SLUG_LENGTH = 50;

/**
 * Schema for nullable bucket - accepts a valid bucket slug (string) or null.
 */
const NullableBucketSchema = v.nullable(
	v.pipe(
		v.string('bucket must be a string'),
		v.maxLength(MAX_BUCKET_SLUG_LENGTH, `bucket must not exceed ${MAX_BUCKET_SLUG_LENGTH} characters`),
		v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'bucket must be a valid slug (lowercase letters, numbers, and hyphens)')
	)
);

/**
 * Schema for sense text with validation rules:
 * - Non-empty after trimming
 * - Max 500 characters
 */
const SenseTextSchema = v.pipe(
	v.string(),
	v.transform((s) => s.trim()),
	v.minLength(1, 'text cannot be empty'),
	v.maxLength(MAX_SENSE_TEXT_LENGTH, `text must not exceed ${MAX_SENSE_TEXT_LENGTH} characters`)
);

/**
 * Schema for update term sense request body.
 *
 * Requires:
 * - expectedVersion: integer for optimistic locking
 * - At least one of text or bucket
 */
export const UpdateTermSenseSchema = v.pipe(
	v.object({
		expectedVersion: v.pipe(v.number(), v.integer('expectedVersion must be an integer')),
		text: v.optional(SenseTextSchema),
		bucket: v.optional(NullableBucketSchema),
	}),
	v.check((input) => input.text !== undefined || input.bucket !== undefined, 'At least one of text or bucket must be provided')
);

/**
 * Type for validated update term sense input.
 */
export type UpdateTermSenseInput = v.InferOutput<typeof UpdateTermSenseSchema>;

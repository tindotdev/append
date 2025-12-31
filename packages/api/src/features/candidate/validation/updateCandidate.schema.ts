/**
 * Valibot schema for PUT /api/candidate/:id request body.
 */

import * as v from 'valibot';

/**
 * Maximum length for chosen text.
 */
export const MAX_CHOSEN_TEXT_LENGTH = 500;

/**
 * Maximum length for bucket slug.
 */
export const MAX_BUCKET_SLUG_LENGTH = 50;

/**
 * Schema for nullable bucket - accepts a valid bucket slug (string) or null.
 * The actual validation against user's buckets is done at the database level.
 */
const NullableBucketSchema = v.nullable(
	v.pipe(
		v.string('chosenBucket must be a string'),
		v.maxLength(MAX_BUCKET_SLUG_LENGTH, `chosenBucket must not exceed ${MAX_BUCKET_SLUG_LENGTH} characters`),
		v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'chosenBucket must be a valid slug (lowercase letters, numbers, and hyphens)')
	)
);

/**
 * Schema for nullable chosen text with validation rules:
 * - Non-empty after trimming
 * - Single line (no newlines)
 * - Max 500 characters
 */
const NullableChosenTextSchema = v.nullable(
	v.pipe(
		v.string(),
		v.transform((s) => s.trim()),
		v.minLength(1, 'chosenText cannot be empty'),
		v.maxLength(MAX_CHOSEN_TEXT_LENGTH, `chosenText must not exceed ${MAX_CHOSEN_TEXT_LENGTH} characters`),
		v.custom<string>((value) => typeof value === 'string' && !value.includes('\n'), 'chosenText must be a single line')
	)
);

/**
 * Schema for update candidate request body.
 *
 * Requires:
 * - expectedVersion: integer for optimistic locking
 * - At least one of chosenBucket or chosenText
 *
 * Both chosenBucket and chosenText are optional keys, but when present
 * they can be a valid value or null (to clear the field).
 */
export const UpdateCandidateSchema = v.pipe(
	v.object({
		expectedVersion: v.pipe(v.number(), v.integer('expectedVersion must be an integer')),
		chosenBucket: v.optional(NullableBucketSchema),
		chosenText: v.optional(NullableChosenTextSchema),
	}),
	v.check(
		(input) => input.chosenBucket !== undefined || input.chosenText !== undefined,
		'At least one of chosenBucket or chosenText must be provided'
	)
);

/**
 * Type for validated update candidate input.
 */
export type UpdateCandidateInput = v.InferOutput<typeof UpdateCandidateSchema>;

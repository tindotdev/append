/**
 * Valibot schema for PUT /api/candidate/:id request body.
 */

import { BUCKETS } from '@append/contracts/types';
import * as v from 'valibot';

/**
 * Maximum length for chosen text.
 */
export const MAX_CHOSEN_TEXT_LENGTH = 500;

/**
 * Schema for nullable bucket - accepts a valid bucket string or null.
 * Uses custom message to include field name for clearer error messages.
 */
const NullableBucketSchema = v.nullable(v.picklist(BUCKETS, `chosenBucket must be one of: ${BUCKETS.join(', ')}`));

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

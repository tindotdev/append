/**
 * Valibot schema for POST /api/batch (capture terms).
 */

import * as v from 'valibot';

/**
 * Constants for term validation.
 */
export const MIN_TERMS = 1;
export const MAX_TERMS = 200;
export const MAX_TERM_LENGTH = 200;
export const MAX_BODY_SIZE = 64 * 1024; // 64 KiB

/**
 * Schema for a single term line.
 * - Must not exceed MAX_TERM_LENGTH characters
 * - Must not contain ': ' (export delimiter safety)
 */
const TermLineSchema = v.pipe(
	v.string(),
	v.maxLength(MAX_TERM_LENGTH, `Term exceeds ${MAX_TERM_LENGTH} characters`),
	v.custom<string>((value) => typeof value === 'string' && !value.includes(': '), 'Term contains ": " which is not allowed')
);

/**
 * Transform a multi-line string into an array of trimmed, non-empty term lines.
 */
const TermsTransformSchema = v.pipe(
	v.string(),
	v.transform((s) =>
		s
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0)
	),
	v.minLength(MIN_TERMS, `At least ${MIN_TERMS} terms are required`),
	v.maxLength(MAX_TERMS, `At most ${MAX_TERMS} terms are allowed`),
	v.array(TermLineSchema)
);

/**
 * Schema for the capture terms request body.
 */
export const CaptureTermsSchema = v.object({
	terms: TermsTransformSchema,
	clientRequestId: v.pipe(v.string(), v.uuid('clientRequestId must be a valid UUID')),
});

/**
 * Type for validated capture terms request.
 */
export type CaptureTermsInput = v.InferOutput<typeof CaptureTermsSchema>;

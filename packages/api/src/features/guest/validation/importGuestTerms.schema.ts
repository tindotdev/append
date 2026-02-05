import * as v from 'valibot';
import { normalize } from '../../../db';

const UUID = (label: string) => v.pipe(v.string(), v.uuid(`${label} must be a valid UUID`));

const BucketSlugSchema = v.picklist(['foundations', 'backend', 'frontend', 'dx-tooling', 'deep-concepts'], 'bucketSlug is invalid');

function isSaneTimestampMs(value: number): boolean {
	// Allow up to 24h in the future (clock skew / timezones).
	const now = Date.now();
	return value > 946684800000 && value < now + 24 * 60 * 60 * 1000; // > 2000-01-01
}

export const ImportGuestTermItemSchema = v.object({
	clientTermId: UUID('clientTermId'),
	term: v.pipe(v.string(), v.minLength(1, 'term is required'), v.maxLength(200, 'term must be <= 200 chars')),
	definition: v.pipe(v.string(), v.minLength(1, 'definition is required'), v.maxLength(2000, 'definition must be <= 2000 chars')),
	bucketSlug: BucketSlugSchema,
	createdAtMs: v.pipe(v.number(), v.check(isSaneTimestampMs, 'createdAtMs must be a sane timestamp in ms')),
});

export const ImportGuestTermsSchema = v.object({
	clientRequestId: UUID('clientRequestId'),
	items: v.pipe(v.array(ImportGuestTermItemSchema), v.minLength(1, 'items must not be empty'), v.maxLength(100, 'items must be <= 100')),
});

export type ImportGuestTermsInput = Omit<v.InferOutput<typeof ImportGuestTermsSchema>, 'items'> & {
	items: Array<
		v.InferOutput<typeof ImportGuestTermItemSchema> & {
			canonical: string;
		}
	>;
};

export function withCanonicals(parsed: v.InferOutput<typeof ImportGuestTermsSchema>): ImportGuestTermsInput {
	return {
		...parsed,
		items: parsed.items.map((i) => ({
			...i,
			canonical: normalize(i.term),
		})),
	};
}

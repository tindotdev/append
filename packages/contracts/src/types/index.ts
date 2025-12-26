export const BUCKETS = ['foundations', 'backend', 'frontend', 'dx-tooling', 'deep-concepts'] as const;
export type Bucket = (typeof BUCKETS)[number];

export const BUCKET_TITLES: Record<Bucket, string> = {
	foundations: 'Foundations',
	backend: 'Backend',
	frontend: 'Frontend',
	'dx-tooling': 'DX Tooling',
	'deep-concepts': 'Deep Concepts',
};

export type BucketOption = {
	slug: Bucket;
	label: string;
};

export const BUCKET_OPTIONS: BucketOption[] = BUCKETS.map((slug) => ({
	slug,
	label: BUCKET_TITLES[slug],
}));

export const BUCKET_LIST = BUCKETS.join(', ');

export function isBucket(value: string): value is Bucket {
	return (BUCKETS as readonly string[]).includes(value);
}

export type TryBucketSlug = 'foundations' | 'backend' | 'frontend' | 'dx-tooling' | 'deep-concepts';

export interface TryBucket {
	slug: TryBucketSlug;
	name: string;
	description: string;
	order: number;
	icon?: string | null;
}

export interface TryTerm {
	termId: string;
	displayTerm: string;
	canonical: string;
	termVersion: number;
	source: 'seed' | 'user';
	primarySense: {
		id: string;
		bucket: TryBucketSlug;
		text: string;
		createdAt: number;
		version: number;
	};
}

export interface TryState {
	version: 1;
	seededAtMs: number;
	buckets: TryBucket[];
	terms: TryTerm[];
}

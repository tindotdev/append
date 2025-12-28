import type { Bucket } from '@append/contracts/types';

export interface BucketFeedItem {
	termId: string;
	displayTerm: string;
	canonical: string;
	primarySense: {
		id: string;
		bucket: Bucket;
		text: string;
		createdAt: number;
	};
}

export interface BucketFeedResponse {
	bucket: string;
	items: BucketFeedItem[];
	nextCursor: string | null;
}

export interface GetBucketFeedOptions {
	limit?: number;
	cursor?: string;
}

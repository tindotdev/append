export interface BucketFeedItem {
	termId: string;
	displayTerm: string;
	canonical: string;
	primarySense: {
		id: string;
		bucket: string;
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

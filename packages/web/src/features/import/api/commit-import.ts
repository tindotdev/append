/**
 * Commit an import to create terms and senses.
 */

import { api, handleRpcResponse } from '@/lib/api-rpc';

export interface BucketMapping {
	r2Key: string;
	bucketId: string;
}

export interface CommitStats {
	termCreatedCount: number;
	termSenseCreatedCount: number;
	bucketCreatedCount: number;
	flaggedCount: number;
	skippedCount: number;
}

export interface CreatedBucket {
	id: string;
	slug: string;
	name: string;
}

export interface CommitResult {
	status: 'done';
	stats: CommitStats;
	bucketsCreated: CreatedBucket[];
}

export async function commitImport(importId: string, bucketMappings: BucketMapping[]): Promise<CommitResult> {
	const clientRequestId = crypto.randomUUID();

	const res = await api.api.import.commit.$post({
		json: {
			clientRequestId,
			importId,
			bucketMappings,
		},
	});

	return handleRpcResponse<CommitResult>(res);
}

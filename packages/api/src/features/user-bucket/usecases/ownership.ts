export type BucketOwnershipError = { type: 'not_found'; message: string } | { type: 'forbidden'; message: string };

export function bucketOwnershipError(type: BucketOwnershipError['type']): BucketOwnershipError {
	const message = type === 'not_found' ? 'Bucket not found' : 'Access denied';
	return { type, message };
}

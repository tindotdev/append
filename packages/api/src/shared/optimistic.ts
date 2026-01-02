export type OptimisticConflictResult = { status: 'not_found' } | { status: 'version_conflict'; currentVersion: number };

export async function resolveOptimisticConflict<T extends NonNullable<unknown>>(
	fetchCurrent: () => Promise<T | null | undefined>,
	getVersion: (row: T) => number
): Promise<OptimisticConflictResult> {
	const current = await fetchCurrent();

	if (!current) {
		return { status: 'not_found' };
	}

	return { status: 'version_conflict', currentVersion: getVersion(current) };
}

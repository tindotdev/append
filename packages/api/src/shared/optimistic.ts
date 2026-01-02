export type OptimisticConflictResult = { status: 'not_found' } | { status: 'version_conflict'; currentVersion: number };

export type OptimisticError = { type: 'not_found' } | { type: 'version_conflict'; currentVersion: number };

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

export function toOptimisticError(conflict: OptimisticConflictResult): OptimisticError {
	if (conflict.status === 'not_found') {
		return { type: 'not_found' };
	}

	return { type: 'version_conflict', currentVersion: conflict.currentVersion };
}

/**
 * Fetch import history from the API.
 */

import { api, handleRpcResponse } from '@/lib/api-rpc';

export interface ImportHistoryFile {
	id: string;
	filename: string;
	size: number;
	entriesImported: number;
}

export interface ImportHistoryItem {
	id: string;
	importId: string;
	status: 'pending' | 'done' | 'error';
	termCreatedCount: number;
	termSenseCreatedCount: number;
	flaggedCount: number;
	skippedCount: number;
	createdAt: string;
	completedAt: string | null;
	files: ImportHistoryFile[];
}

export interface ImportHistoryResult {
	items: ImportHistoryItem[];
	hasMore: boolean;
}

export async function getImportHistory(limit = 10): Promise<ImportHistoryResult> {
	const res = await api.api.import.history.$get({
		query: { limit: String(limit) },
	});

	return handleRpcResponse<ImportHistoryResult>(res);
}

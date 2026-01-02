/**
 * Fetch export history from the API.
 */

import { api, handleRpcResponse } from '@/lib/api-rpc';

export interface ExportHistoryItem {
	id: string;
	bucketSlug: string;
	bucketName: string;
	filename: string;
	entryCount: number;
	createdAt: string;
}

export interface ExportHistoryResult {
	items: ExportHistoryItem[];
	hasMore: boolean;
}

export async function getExportHistory(limit = 10): Promise<ExportHistoryResult> {
	const res = await api.api.export.history.$get({
		query: { limit: String(limit) },
	});

	return handleRpcResponse<ExportHistoryResult>(res);
}

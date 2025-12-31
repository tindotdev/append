/**
 * Preview an import by parsing uploaded files.
 */

import { api, handleRpcResponse } from '@/lib/api-rpc';

export interface ParsedEntry {
	term: string;
	definition: string;
	lineNumber: number;
	isInbox: boolean;
}

export interface ParseWarning {
	lineNumber: number;
	message: string;
}

export interface ParsedFilePreview {
	filename: string;
	r2Key: string;
	suggestedBucketSlug: string | null;
	entries: ParsedEntry[];
	warnings: ParseWarning[];
}

export interface PreviewStats {
	totalEntries: number;
	entriesWithDefinition: number;
	inboxEntries: number;
	existingTerms: number;
	newTerms: number;
}

export interface ExistingBucket {
	id: string;
	slug: string;
	name: string;
}

export interface PreviewResult {
	importId: string;
	parsedFiles: ParsedFilePreview[];
	stats: PreviewStats;
	existingBuckets: ExistingBucket[];
}

export async function previewImport(importId: string): Promise<PreviewResult> {
	const res = await api.api.import.preview.$post({
		json: { importId },
	});

	return handleRpcResponse<PreviewResult>(res);
}

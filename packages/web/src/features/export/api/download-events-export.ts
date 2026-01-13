import { apiFetch } from '@/lib/api-rpc';

export type EventsExportResult =
	| { success: true; filename: string; truncated: false }
	| { success: true; filename: string; truncated: true; cursor: string }
	| { success: false; error: string };

interface ApiErrorResponse {
	error?: { code?: string; message?: string };
}

export interface EventsExportParams {
	from: string; // YYYY-MM-DD
	to: string; // YYYY-MM-DD
	cursor?: string; // base64url-encoded cursor for continuation
	partNumber?: number; // Part number for multi-chunk exports (1-based)
}

/**
 * Download raw telemetry events as NDJSON.
 * Triggers a browser download as a side-effect.
 *
 * Note: Can't use Hono RPC for this as it returns a blob, not JSON.
 *
 * Returns truncation info if the export was truncated (206 response).
 * The caller should use the returned cursor to continue the export.
 */
export async function downloadEventsExport(params: EventsExportParams): Promise<EventsExportResult> {
	const searchParams = new URLSearchParams({
		from: params.from,
		to: params.to,
		format: 'ndjson',
	});

	if (params.cursor) {
		searchParams.set('cursor', params.cursor);
	}

	const res = await apiFetch(`/events/export?${searchParams.toString()}`);

	// Handle error responses (JSON)
	if (!res.ok && res.status !== 206) {
		const body = (await res.json().catch(() => ({ error: { message: 'Unknown error' } }))) as ApiErrorResponse;
		return { success: false, error: body.error?.message ?? `HTTP ${res.status}` };
	}

	// Check for truncation (206 Partial Content)
	const truncated = res.status === 206 || res.headers.get('X-Export-Truncated') === 'true';
	const cursor = res.headers.get('X-Export-Cursor');

	// Generate filename with date range and optional part number
	const partSuffix = params.partNumber ? `.part-${String(params.partNumber).padStart(3, '0')}` : '';
	const filename = `events_${params.from}_${params.to}${partSuffix}.ndjson`;

	// Get response as blob and trigger browser download
	const blob = await res.blob();
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();

	// Cleanup: remove anchor and revoke object URL
	document.body.removeChild(a);
	URL.revokeObjectURL(url);

	if (truncated && cursor) {
		return { success: true, filename, truncated: true, cursor };
	}

	return { success: true, filename, truncated: false };
}

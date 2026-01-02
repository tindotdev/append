import { apiFetch } from '@/lib/api-rpc';

export type DownloadResult = { success: true; filename: string } | { success: false; error: string };

interface ApiErrorResponse {
	error?: { code?: string; message?: string };
}

/**
 * Download a bucket export as markdown.
 * Triggers a browser download as a side-effect.
 *
 * Note: Can't use Hono RPC for this as it returns a blob, not JSON.
 */
export async function downloadBucketExport(bucket: string): Promise<DownloadResult> {
	const res = await apiFetch(`/api/export/${bucket}`);

	// Handle error responses (JSON)
	if (!res.ok) {
		const body = (await res.json().catch(() => ({ error: { message: 'Unknown error' } }))) as ApiErrorResponse;
		return { success: false, error: body.error?.message ?? `HTTP ${res.status}` };
	}

	// Extract filename from content-disposition header, fallback to {bucket}.md
	const disposition = res.headers.get('content-disposition') ?? '';
	const filenameMatch = disposition.match(/filename="([^"]+)"/);
	const filename = filenameMatch?.[1] ?? `${bucket}.md`;

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

	return { success: true, filename };
}

/**
 * Upload files to the import endpoint.
 *
 * Note: FilePond handles the upload directly, but we provide this
 * for manual uploads if needed.
 */

import { apiFetch } from '@/lib/api-rpc';

export interface UploadedFile {
	filename: string;
	r2Key: string;
	size: number;
}

export interface UploadResult {
	importId: string;
	files: UploadedFile[];
}

export async function uploadFiles(files: File[]): Promise<UploadResult> {
	const formData = new FormData();
	for (const file of files) {
		formData.append('files', file);
	}

	const response = await apiFetch('/api/import/upload', {
		method: 'POST',
		body: formData,
	});

	if (!response.ok) {
		const errorBody = (await response.json()) as { error?: { message?: string } };
		throw new Error(errorBody.error?.message || 'Upload failed');
	}

	return response.json();
}

/**
 * Upload markdown files to R2 for import processing.
 *
 * Files are stored at: imports/{userId}/{importId}/{filename}
 */

export interface UploadedFile {
	filename: string;
	r2Key: string;
	size: number;
}

export interface UploadFilesResult {
	importId: string;
	files: UploadedFile[];
}

export type UploadFilesError =
	| { type: 'no_files'; message: string }
	| { type: 'invalid_file_type'; message: string }
	| { type: 'file_too_large'; message: string };

export type UploadFilesOutcome = { success: true; result: UploadFilesResult } | { success: false; error: UploadFilesError };

/** Maximum file size: 1 MB */
const MAX_FILE_SIZE = 1024 * 1024;

/** Allowed file extensions */
const ALLOWED_EXTENSIONS = ['.md', '.markdown'];

/**
 * Upload files to R2 storage.
 *
 * @param r2 - R2 bucket binding
 * @param userId - Authenticated user ID
 * @param files - Array of files from multipart form data
 * @param clientImportId - Optional importId provided by client (for multi-file uploads)
 * @returns Upload result with importId and file keys
 */
export async function uploadFiles(r2: R2Bucket, userId: string, files: File[], clientImportId?: string): Promise<UploadFilesOutcome> {
	// Validate: at least one file
	if (files.length === 0) {
		return {
			success: false,
			error: {
				type: 'no_files',
				message: 'At least one markdown file is required',
			},
		};
	}

	// Validate: all files are markdown and within size limit
	for (const file of files) {
		const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
		if (!ALLOWED_EXTENSIONS.includes(ext)) {
			return {
				success: false,
				error: {
					type: 'invalid_file_type',
					message: `Invalid file type: ${file.name}. Only .md files are allowed`,
				},
			};
		}

		if (file.size > MAX_FILE_SIZE) {
			return {
				success: false,
				error: {
					type: 'file_too_large',
					message: `File too large: ${file.name}. Maximum size is 1 MB`,
				},
			};
		}
	}

	// Use client-provided importId or generate new one
	const importId = clientImportId || crypto.randomUUID();

	// Upload files to R2
	const uploadedFiles: UploadedFile[] = [];

	for (const file of files) {
		const r2Key = `imports/${userId}/${importId}/${file.name}`;
		const content = await file.arrayBuffer();

		await r2.put(r2Key, content, {
			httpMetadata: {
				contentType: 'text/markdown',
			},
			customMetadata: {
				originalFilename: file.name,
				uploadedAt: new Date().toISOString(),
			},
		});

		uploadedFiles.push({
			filename: file.name,
			r2Key,
			size: file.size,
		});
	}

	return {
		success: true,
		result: {
			importId,
			files: uploadedFiles,
		},
	};
}

export interface ListedFile {
	key: string;
	size: number;
}

/**
 * List files for an import from R2.
 *
 * @param r2 - R2 bucket binding
 * @param userId - Authenticated user ID
 * @param importId - Import ID to list files for
 * @returns Array of file info or null if not found
 */
export async function listImportFiles(r2: R2Bucket, userId: string, importId: string): Promise<ListedFile[] | null> {
	const prefix = `imports/${userId}/${importId}/`;
	const listed = await r2.list({ prefix });

	if (listed.objects.length === 0) {
		return null;
	}

	return listed.objects.map((obj) => ({ key: obj.key, size: obj.size }));
}

export type ImportFilesResult = { ok: true; objects: ListedFile[] } | { ok: false; error: { type: 'not_found'; message: string } };

/**
 * Require import files to exist in R2.
 *
 * @param r2 - R2 bucket binding
 * @param userId - Authenticated user ID
 * @param importId - Import ID to list files for
 * @returns Result with objects or not_found error
 */
export async function requireImportFiles(r2: R2Bucket, userId: string, importId: string): Promise<ImportFilesResult> {
	const objects = await listImportFiles(r2, userId, importId);
	if (!objects) {
		return { ok: false, error: { type: 'not_found', message: 'Import not found' } };
	}

	return { ok: true, objects };
}

/**
 * Get file content from R2.
 *
 * @param r2 - R2 bucket binding
 * @param r2Key - Full R2 key for the file
 * @returns File content as string or null if not found
 */
export async function getFileContent(r2: R2Bucket, r2Key: string): Promise<string | null> {
	const object = await r2.get(r2Key);
	if (!object) return null;

	return object.text();
}

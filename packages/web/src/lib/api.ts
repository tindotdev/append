import type { Bucket } from '@append/contracts/types';

// API URL - local dev or production
const API_URL = import.meta.env.DEV ? 'http://localhost:8787' : 'https://api.append.tindev.dev';

export interface ApiError {
	code: string;
	message: string;
}

export interface ApiErrorResponse {
	error: ApiError;
}

export class ApiRequestError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string
	) {
		super(message);
		this.name = 'ApiRequestError';
	}
}

async function handleResponse<T>(response: Response): Promise<T> {
	const contentType = response.headers.get('content-type') || '';
	const isJson = contentType.includes('application/json');

	if (!response.ok) {
		if (isJson) {
			const errorBody = (await response.json()) as ApiErrorResponse;
			throw new ApiRequestError(response.status, errorBody.error.code, errorBody.error.message);
		}
		throw new ApiRequestError(response.status, 'UNKNOWN_ERROR', response.statusText);
	}

	if (isJson) {
		return response.json() as Promise<T>;
	}

	return undefined as T;
}

export interface CreateBatchRequest {
	terms: string;
	clientRequestId: string;
}

export interface CreateBatchResponse {
	id: string;
	candidateCount: number;
}

/** Allowed bucket slugs */
export type { Bucket };

/** Suggestion generation status */
export type SuggestionStatus = 'in_progress' | 'done' | 'error';

export interface Candidate {
	id: string;
	position: number;
	term: string;
	normalizedTerm: string;
	status: string;
	// Step 4 fields
	chosenBucket: Bucket | null;
	chosenText: string | null;
	suggestedBucket: Bucket | null;
	suggestedText: string | null;
	suggestionStatus: SuggestionStatus | null;
	suggestionError: string | null;
	suggestionAttempts: number;
	version: number;
	materializedTermId: string | null;
	materializedTermSenseId: string | null;
	createdAt: number;
	updatedAt: number;
}

export interface BatchResponse {
	id: string;
	status: string;
	createdAt: number;
	updatedAt: number;
	candidateCount: number;
	candidates: Candidate[];
}

export async function createBatch(request: CreateBatchRequest): Promise<CreateBatchResponse> {
	const response = await fetch(`${API_URL}/api/batch`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		body: JSON.stringify(request),
	});

	return handleResponse<CreateBatchResponse>(response);
}

export async function getBatch(id: string): Promise<BatchResponse> {
	const response = await fetch(`${API_URL}/api/batch/${id}`, {
		method: 'GET',
		credentials: 'include',
	});

	return handleResponse<BatchResponse>(response);
}

export interface UpdateCandidateRequest {
	expectedVersion: number;
	chosenBucket?: Bucket | null;
	chosenText?: string | null;
}

export interface UpdateCandidateResponse {
	candidate: Candidate;
}

export interface VersionConflictDetails {
	currentVersion: number;
}

export async function updateCandidate(id: string, request: UpdateCandidateRequest): Promise<UpdateCandidateResponse> {
	const response = await fetch(`${API_URL}/api/candidate/${id}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		body: JSON.stringify(request),
	});

	return handleResponse<UpdateCandidateResponse>(response);
}

// =============================================================================
// Bucket Feed API (Step 6)
// =============================================================================

export interface BucketFeedItem {
	termId: string;
	displayTerm: string;
	canonical: string;
	primarySense: {
		id: string;
		bucket: Bucket;
		text: string;
		createdAt: number;
	};
}

export interface BucketFeedResponse {
	bucket: string;
	items: BucketFeedItem[];
	nextCursor: string | null;
}

export interface GetBucketFeedOptions {
	limit?: number;
	cursor?: string;
}

export async function getBucketFeed(slug: Bucket, options?: GetBucketFeedOptions): Promise<BucketFeedResponse> {
	const params = new URLSearchParams();
	if (options?.limit !== undefined) {
		params.set('limit', String(options.limit));
	}
	if (options?.cursor) {
		params.set('cursor', options.cursor);
	}

	const queryString = params.toString();
	const url = `${API_URL}/api/bucket/${slug}${queryString ? `?${queryString}` : ''}`;

	const response = await fetch(url, {
		method: 'GET',
		credentials: 'include',
	});

	return handleResponse<BucketFeedResponse>(response);
}

// =============================================================================
// Export API (Step 7)
// =============================================================================

export type DownloadResult = { success: true; filename: string } | { success: false; error: string };

/**
 * Download a bucket export as markdown.
 * Triggers a browser download as a side-effect.
 */
export async function downloadBucketExport(bucket: Bucket): Promise<DownloadResult> {
	const res = await fetch(`${API_URL}/api/export/${bucket}`, {
		credentials: 'include',
	});

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

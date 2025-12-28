import type { Bucket } from '@append/contracts/types';

export type SuggestionStatus = 'in_progress' | 'done' | 'error';

export interface Candidate {
	id: string;
	position: number;
	term: string;
	normalizedTerm: string;
	status: string;
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

export interface BatchListItem {
	id: string;
	status: 'captured' | 'suggested' | 'accepted';
	candidateCount: number;
	createdAt: number;
	updatedAt: number;
}

export interface ListBatchesResponse {
	batches: BatchListItem[];
	nextCursor: string | null;
}

export interface ListBatchesOptions {
	limit?: number;
	cursor?: string;
}

export interface CreateBatchRequest {
	terms: string;
	clientRequestId: string;
}

export interface CreateBatchResponse {
	id: string;
	candidateCount: number;
}

export interface UpdateCandidateRequest {
	expectedVersion: number;
	chosenBucket?: Bucket | null;
	chosenText?: string | null;
}

export interface UpdateCandidateResponse {
	candidate: Candidate;
}

export interface RetrySuggestionsResponse {
	batchId: string;
	mode: 'fill-missing' | 'regenerate';
	limit: number;
	candidateCount: number;
	eligibleCount: number;
	results: {
		suggested: number;
		cached: number;
		skippedAlreadySuggested: number;
		skippedInProgress: number;
		errors: number;
	};
}

// UI Types
export type BatchError = { status: number; message: string };

export interface CandidateDraft {
	bucket: Bucket | null;
	text: string;
}

export interface CandidateRowState {
	draft: CandidateDraft;
	isSaving: boolean;
	error: string | null;
	showSuccess: boolean;
}

export type RowStateMap = Record<string, CandidateRowState>;

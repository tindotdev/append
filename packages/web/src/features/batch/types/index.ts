export type SuggestionStatus = 'in_progress' | 'done' | 'error';

export interface Candidate {
	id: string;
	position: number;
	term: string;
	normalizedTerm: string;
	status: string;
	chosenBucket: string | null;
	chosenText: string | null;
	suggestedBucket: string | null;
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

export interface StatusBreakdown {
	ready: number;
	pending: number;
	accepted: number;
	error: number;
}

export interface BatchListItem {
	id: string;
	status: 'captured' | 'suggested' | 'accepted';
	candidateCount: number;
	statusBreakdown: StatusBreakdown;
	acceptanceRate: number; // 0-100
	sampleTerms: string[];
	hasErrors: boolean;
	errorCount: number;
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
	chosenBucket?: string | null;
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

// SSE Event Types (from backend generateSuggestions)
export interface SuggestStartEvent {
	batchId: string;
	mode: 'fill-missing' | 'regenerate';
	candidateCount: number;
	eligibleCount: number;
	limit: number;
}

export interface SuggestCandidateEvent {
	id: string;
	term: string;
	status: 'running' | 'ok' | 'cached' | 'error' | 'skipped';
	suggestion?: {
		bucket: string;
		text: string;
	};
	error?: string;
}

export interface SuggestDoneEvent {
	ok: number;
	failed: number;
	cached: number;
	skippedAlreadySuggested: number;
	errors: number;
}

// UI Types
export type BatchError = { status: number; message: string };

export interface CandidateDraft {
	bucket: string | null;
	text: string;
}

export interface CandidateRowState {
	draft: CandidateDraft;
	isSaving: boolean;
	error: string | null;
	showSuccess: boolean;
}

export type RowStateMap = Record<string, CandidateRowState>;

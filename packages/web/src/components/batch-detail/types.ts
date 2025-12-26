import type { Bucket } from '../../lib/api';

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

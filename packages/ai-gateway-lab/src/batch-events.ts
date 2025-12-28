import type { Bucket } from '@append/contracts';

export type CandidateStatus = 'ok' | 'cached' | 'error';

export interface Suggestion {
	bucket: Bucket;
	text: string;
}

export interface StartEvent {
	type: 'start';
	termCount: number;
}

export interface CandidateEvent {
	type: 'candidate';
	index: number;
	term: string;
	status: CandidateStatus;
	suggestion?: Suggestion;
	error?: string;
}

export interface DoneEvent {
	type: 'done';
	ok: number;
	cached: number;
	errors: number;
}

export type BatchEvent = StartEvent | CandidateEvent | DoneEvent;

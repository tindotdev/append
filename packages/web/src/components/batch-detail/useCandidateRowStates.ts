import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { Candidate } from '../../lib/api';
import type { CandidateDraft, RowStateMap } from './types';

const SUCCESS_TIMEOUT_MS = 1000;

type RowStateAction =
	| { type: 'init'; candidates: Candidate[] }
	| { type: 'draft'; id: string; updates: Partial<CandidateDraft> }
	| { type: 'saveStart'; id: string }
	| { type: 'saveError'; id: string; error: string }
	| { type: 'saveSuccess'; id: string; candidate: Candidate }
	| { type: 'hideSuccess'; id: string };

function buildDraft(candidate: Candidate): CandidateDraft {
	return {
		bucket: candidate.chosenBucket ?? candidate.suggestedBucket,
		text: candidate.chosenText ?? candidate.suggestedText ?? '',
	};
}

function buildRowStates(candidates: Candidate[]): RowStateMap {
	const states: RowStateMap = {};
	for (const candidate of candidates) {
		states[candidate.id] = {
			draft: buildDraft(candidate),
			isSaving: false,
			error: null,
			showSuccess: false,
		};
	}
	return states;
}

function rowStateReducer(state: RowStateMap, action: RowStateAction): RowStateMap {
	switch (action.type) {
		case 'init':
			return buildRowStates(action.candidates);
		case 'draft': {
			const row = state[action.id];
			if (!row) return state;
			return {
				...state,
				[action.id]: {
					...row,
					draft: { ...row.draft, ...action.updates },
					error: null,
				},
			};
		}
		case 'saveStart': {
			const row = state[action.id];
			if (!row) return state;
			return {
				...state,
				[action.id]: { ...row, isSaving: true, error: null },
			};
		}
		case 'saveError': {
			const row = state[action.id];
			if (!row) return state;
			return {
				...state,
				[action.id]: { ...row, isSaving: false, error: action.error },
			};
		}
		case 'saveSuccess': {
			const row = state[action.id];
			if (!row) return state;
			return {
				...state,
				[action.id]: {
					...row,
					isSaving: false,
					error: null,
					showSuccess: true,
					draft: buildDraft(action.candidate),
				},
			};
		}
		case 'hideSuccess': {
			const row = state[action.id];
			if (!row) return state;
			return {
				...state,
				[action.id]: { ...row, showSuccess: false },
			};
		}
		default:
			return state;
	}
}

export function useCandidateRowStates() {
	const [rowStates, dispatch] = useReducer(rowStateReducer, {} as RowStateMap);
	const timersRef = useRef<Record<string, number>>({});

	const scheduleSuccessClear = useCallback((id: string) => {
		const existing = timersRef.current[id];
		if (existing) {
			window.clearTimeout(existing);
		}
		timersRef.current[id] = window.setTimeout(() => {
			dispatch({ type: 'hideSuccess', id });
		}, SUCCESS_TIMEOUT_MS);
	}, []);

	useEffect(() => {
		return () => {
			for (const timer of Object.values(timersRef.current)) {
				window.clearTimeout(timer);
			}
			timersRef.current = {};
		};
	}, []);

	const initialize = useCallback((candidates: Candidate[]) => {
		dispatch({ type: 'init', candidates });
	}, []);

	const updateDraft = useCallback((id: string, updates: Partial<CandidateDraft>) => {
		dispatch({ type: 'draft', id, updates });
	}, []);

	const markSaving = useCallback((id: string) => {
		dispatch({ type: 'saveStart', id });
	}, []);

	const markError = useCallback((id: string, error: string) => {
		dispatch({ type: 'saveError', id, error });
	}, []);

	const applyCandidate = useCallback(
		(id: string, candidate: Candidate) => {
			dispatch({ type: 'saveSuccess', id, candidate });
			scheduleSuccessClear(id);
		},
		[scheduleSuccessClear]
	);

	return { rowStates, initialize, updateDraft, markSaving, markError, applyCandidate };
}

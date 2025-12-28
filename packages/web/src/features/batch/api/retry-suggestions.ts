import { fetchEventSource } from '@microsoft/fetch-event-source';
import { API_URL } from '@/lib/api-client';
import type { SuggestCandidateEvent, SuggestDoneEvent, SuggestStartEvent } from '../types';

export interface GenerateSuggestionsCallbacks {
	onStart?: (event: SuggestStartEvent) => void;
	onCandidate?: (event: SuggestCandidateEvent) => void;
	onDone?: (event: SuggestDoneEvent) => void;
	onError?: (error: string) => void;
}

/**
 * Generate suggestions for a batch using SSE streaming.
 * Updates are delivered via callbacks as they arrive.
 */
export async function generateSuggestions(batchId: string, callbacks: GenerateSuggestionsCallbacks): Promise<void> {
	const { onStart, onCandidate, onDone, onError } = callbacks;

	await fetchEventSource(`${API_URL}/api/batch/${batchId}/suggest`, {
		method: 'POST',
		credentials: 'include',
		onmessage(ev) {
			if (!ev.data) return;

			try {
				const data = JSON.parse(ev.data);

				switch (ev.event) {
					case 'start':
						onStart?.(data as SuggestStartEvent);
						break;
					case 'candidate':
						onCandidate?.(data as SuggestCandidateEvent);
						break;
					case 'done':
						onDone?.(data as SuggestDoneEvent);
						break;
					case 'error':
						onError?.(data.error || 'Unknown error');
						break;
				}
			} catch {
				// Ignore parse errors for malformed events
			}
		},
		onerror(err) {
			onError?.(err instanceof Error ? err.message : 'Connection error');
			throw err; // Stop retrying
		},
	});
}

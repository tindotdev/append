import type { BatchEvent, Suggestion } from './batch-events';
import { type CacheKey, cacheResponse, findCachedResponse } from './cache';
import type { OpenAIModel } from './gateway';
import { MODEL, suggestOne } from './suggest-one';

export async function* processBatch(terms: readonly string[]): AsyncGenerator<BatchEvent> {
	const stats = { ok: 0, cached: 0, errors: 0 };

	yield { type: 'start', termCount: terms.length };

	for (let i = 0; i < terms.length; i++) {
		const term = terms[i];
		const key: CacheKey<OpenAIModel> = { provider: 'openai', model: MODEL, prompt: term };

		try {
			const cached = findCachedResponse<Suggestion>(key);
			if (cached) {
				stats.cached++;
				yield { type: 'candidate', index: i + 1, term, status: 'cached', suggestion: cached };
				continue;
			}

			const suggestion = await suggestOne(term);
			cacheResponse(key, suggestion);
			stats.ok++;
			yield { type: 'candidate', index: i + 1, term, status: 'ok', suggestion };
		} catch (err) {
			stats.errors++;
			const error = err instanceof Error ? err.message : String(err);
			yield { type: 'candidate', index: i + 1, term, status: 'error', error };
		}
	}

	yield { type: 'done', ...stats };
}

export function formatEvent(event: BatchEvent): string {
	switch (event.type) {
		case 'start':
			return `\n[start] Processing ${event.termCount} terms...\n`;
		case 'candidate': {
			const status = event.status === 'cached' ? '(cached)' : event.status === 'ok' ? '(ok)' : '(error)';
			const detail = event.suggestion ? `[${event.suggestion.bucket}] ${event.suggestion.text}` : event.error || '';
			return `  ${event.index.toString().padStart(2)}. ${status.padEnd(9)} ${event.term.padEnd(24)} → ${detail}`;
		}
		case 'done':
			return `\n[done] ok: ${event.ok}, cached: ${event.cached}, errors: ${event.errors}\n`;
	}
}

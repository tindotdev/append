/**
 * Parallel processing utilities with concurrency control.
 *
 * @see ADR 0011 for concurrency decision rationale
 */

/** Default concurrency limit based on rate limit research (ADR 0011) */
export const DEFAULT_CONCURRENCY = 10;

/**
 * Process items in parallel with a concurrency limit, streaming results as they complete.
 *
 * Unlike `Promise.all`, this:
 * - Limits concurrent execution to avoid rate limits
 * - Yields results immediately as each task completes (out-of-order)
 * - Continues processing even if some tasks fail
 *
 * @example
 * ```typescript
 * for await (const result of parallelStream(items, async (item) => {
 *   return await expensiveOperation(item);
 * }, 10)) {
 *   yield sseEvent('item', result);
 * }
 * ```
 */
export async function* parallelStream<T, R>(
	items: T[],
	processor: (item: T) => Promise<R>,
	concurrency = DEFAULT_CONCURRENCY
): AsyncGenerator<PromiseSettledResult<R>, void, unknown> {
	if (items.length === 0) return;

	// Queue to hold completed results for yielding
	const resultQueue: PromiseSettledResult<R>[] = [];
	let pendingResolve: (() => void) | null = null;
	let completedCount = 0;
	let nextIndex = 0;

	const pushResult = (result: PromiseSettledResult<R>) => {
		resultQueue.push(result);
		completedCount++;
		if (pendingResolve) {
			pendingResolve();
			pendingResolve = null;
		}
	};

	const processItem = async (item: T) => {
		try {
			const value = await processor(item);
			pushResult({ status: 'fulfilled', value });
		} catch (reason) {
			pushResult({ status: 'rejected', reason });
		}
	};

	// Start initial batch of concurrent tasks
	const startNext = () => {
		while (nextIndex < items.length && nextIndex - completedCount < concurrency) {
			const item = items[nextIndex++];
			processItem(item).then(() => {
				// When a task completes, start another if available
				startNext();
			});
		}
	};

	startNext();

	// Yield results as they complete
	while (completedCount < items.length) {
		if (resultQueue.length > 0) {
			yield resultQueue.shift()!;
		} else {
			// Wait for the next result
			await new Promise<void>((resolve) => {
				pendingResolve = resolve;
			});
		}
	}

	// Drain any remaining results in the queue
	while (resultQueue.length > 0) {
		yield resultQueue.shift()!;
	}
}

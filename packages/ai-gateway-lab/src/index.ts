import { formatEvent, processBatch } from './batch-processor';
import { type CacheKey, cacheResponse, findCachedResponse } from './cache';
import type { OpenAIModel } from './gateway';
import { runParallelTest } from './parallel-test';
import { MODEL, suggestOne } from './suggest-one';
import { TEST_TERMS } from './terms';

const runSingle = async (term = 'Cloudflare') => {
	const key: CacheKey<OpenAIModel> = { provider: 'openai', model: MODEL, prompt: term };

	const cached = findCachedResponse(key);
	if (cached) {
		console.log('(cached)', cached);
		return;
	}

	const suggestion = await suggestOne(term);
	cacheResponse(key, suggestion);
	console.log(suggestion);
};

const runBatch = async () => {
	for await (const event of processBatch(TEST_TERMS)) {
		console.log(formatEvent(event));
	}
};

const main = async () => {
	const parallelTest = process.env.PARALLEL_TEST === '1';
	const batchMode = process.env.BATCH_MODE === '1';

	if (parallelTest) {
		await runParallelTest();
	} else if (batchMode) {
		await runBatch();
	} else {
		await runSingle();
	}
};

await main();

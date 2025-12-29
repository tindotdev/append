/**
 * Parallel request testing for OpenAI rate limit research.
 *
 * Tests different concurrency levels to determine optimal parallelization
 * for batch suggestion generation.
 *
 * Usage: PARALLEL_TEST=1 pnpm lab
 */

import { valibotSchema } from '@ai-sdk/valibot';
import { BucketSchema } from '@append/contracts';
import { generateText, Output } from 'ai';
import { strictObject, string } from 'valibot';
import { aigateway, openai } from './gateway';
import { SYSTEM_PROMPT } from './system-prompt';
import { TEST_TERMS } from './terms';

const MODEL = 'gpt-5-mini' as const;

const SuggestionSchema = strictObject({
	bucket: BucketSchema,
	text: string(),
});

// Rate limit headers from OpenAI (via AI Gateway)
interface RateLimitHeaders {
	limitRequests?: number;
	limitTokens?: number;
	remainingRequests?: number;
	remainingTokens?: number;
	resetRequests?: string;
	resetTokens?: string;
}

interface RequestResult {
	term: string;
	success: boolean;
	durationMs: number;
	rateLimits?: RateLimitHeaders;
	error?: string;
	bucket?: string;
}

interface ConcurrencyTestResult {
	concurrency: number;
	termCount: number;
	totalDurationMs: number;
	avgRequestDurationMs: number;
	successCount: number;
	errorCount: number;
	rateLimitHits: number;
	lastRateLimits?: RateLimitHeaders;
	requests: RequestResult[];
}

/**
 * Parse rate limit headers from response.
 * Headers come from OpenAI via Cloudflare AI Gateway.
 */
function parseRateLimitHeaders(headers: Headers): RateLimitHeaders {
	return {
		limitRequests: headers.get('x-ratelimit-limit-requests') ? Number(headers.get('x-ratelimit-limit-requests')) : undefined,
		limitTokens: headers.get('x-ratelimit-limit-tokens') ? Number(headers.get('x-ratelimit-limit-tokens')) : undefined,
		remainingRequests: headers.get('x-ratelimit-remaining-requests') ? Number(headers.get('x-ratelimit-remaining-requests')) : undefined,
		remainingTokens: headers.get('x-ratelimit-remaining-tokens') ? Number(headers.get('x-ratelimit-remaining-tokens')) : undefined,
		resetRequests: headers.get('x-ratelimit-reset-requests') ?? undefined,
		resetTokens: headers.get('x-ratelimit-reset-tokens') ?? undefined,
	};
}

/**
 * Make a single suggestion request with timing and header capture.
 */
async function suggestWithMetrics(term: string): Promise<RequestResult> {
	const start = performance.now();

	try {
		const response = await generateText({
			system: SYSTEM_PROMPT,
			model: aigateway(openai.chat(MODEL)),
			prompt: term,
			output: Output.object({
				schema: valibotSchema(SuggestionSchema),
			}),
		});

		const durationMs = Math.round(performance.now() - start);

		// Access experimental response headers if available (may not be typed)
		// biome-ignore lint/suspicious/noExplicitAny: accessing experimental API
		const experimental = (response as any).experimental_providerMetadata?.openai?.headers as Headers | undefined;
		const rateLimits = experimental ? parseRateLimitHeaders(experimental) : undefined;

		const suggestion = response.output as { bucket: string; text: string };

		return {
			term,
			success: true,
			durationMs,
			rateLimits,
			bucket: suggestion.bucket,
		};
	} catch (err) {
		const durationMs = Math.round(performance.now() - start);
		const error = err instanceof Error ? err.message : String(err);
		const isRateLimit = error.includes('429') || error.toLowerCase().includes('rate limit');

		return {
			term,
			success: false,
			durationMs,
			error,
			rateLimits: isRateLimit ? { remainingRequests: 0 } : undefined,
		};
	}
}

/**
 * Simple concurrency limiter using a semaphore pattern.
 */
async function withConcurrencyLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
	const results: T[] = [];
	const executing: Promise<void>[] = [];

	for (const task of tasks) {
		const p = task().then((result) => {
			results.push(result);
		});

		executing.push(
			p.then(() => {
				executing.splice(executing.indexOf(p), 1);
			})
		);

		if (executing.length >= limit) {
			await Promise.race(executing);
		}
	}

	await Promise.all(executing);
	return results;
}

/**
 * Run a test with a specific concurrency level.
 */
async function runConcurrencyTest(terms: readonly string[], concurrency: number): Promise<ConcurrencyTestResult> {
	console.log(`\n[test] concurrency=${concurrency}, terms=${terms.length}`);

	const tasks = terms.map((term) => () => suggestWithMetrics(term));

	const start = performance.now();
	const results = await withConcurrencyLimit(tasks, concurrency);
	const totalDurationMs = Math.round(performance.now() - start);

	const successCount = results.filter((r) => r.success).length;
	const errorCount = results.filter((r) => !r.success).length;
	const rateLimitHits = results.filter((r) => r.error?.includes('429') || r.rateLimits?.remainingRequests === 0).length;

	const avgRequestDurationMs = Math.round(results.reduce((sum, r) => sum + r.durationMs, 0) / results.length);

	// Get last successful rate limit headers
	const lastWithHeaders = [...results].reverse().find((r) => r.rateLimits?.limitRequests);

	return {
		concurrency,
		termCount: terms.length,
		totalDurationMs,
		avgRequestDurationMs,
		successCount,
		errorCount,
		rateLimitHits,
		lastRateLimits: lastWithHeaders?.rateLimits,
		requests: results,
	};
}

/**
 * Format a single test result for console output.
 */
function formatResult(result: ConcurrencyTestResult): string {
	const lines = [
		`  Concurrency: ${result.concurrency}`,
		`  Total time:  ${result.totalDurationMs}ms`,
		`  Avg request: ${result.avgRequestDurationMs}ms`,
		`  Success:     ${result.successCount}/${result.termCount}`,
		`  Errors:      ${result.errorCount}`,
		`  Rate limits: ${result.rateLimitHits}`,
	];

	if (result.lastRateLimits) {
		lines.push(
			`  Remaining:   ${result.lastRateLimits.remainingRequests ?? '?'} req, ${result.lastRateLimits.remainingTokens ?? '?'} tokens`
		);
	}

	return lines.join('\n');
}

/**
 * Main entry point for parallel testing.
 */
export async function runParallelTest(): Promise<void> {
	const concurrencyLevels = [1, 3, 5, 10, 20];
	const results: ConcurrencyTestResult[] = [];

	console.log('='.repeat(60));
	console.log('OpenAI Rate Limit Research - Parallel Request Testing');
	console.log('='.repeat(60));
	console.log(`\nTerms: ${TEST_TERMS.length}`);
	console.log(`Concurrency levels to test: ${concurrencyLevels.join(', ')}`);
	console.log(`Model: ${MODEL}`);

	for (const concurrency of concurrencyLevels) {
		// Wait between tests to allow rate limits to reset
		if (results.length > 0) {
			console.log('\n[wait] 10s cooldown between tests...');
			await new Promise((resolve) => setTimeout(resolve, 10_000));
		}

		const result = await runConcurrencyTest(TEST_TERMS, concurrency);
		results.push(result);

		console.log(formatResult(result));

		// If we hit rate limits, warn and potentially stop
		if (result.rateLimitHits > 0) {
			console.log(`\n[warn] Hit ${result.rateLimitHits} rate limit(s) at concurrency=${concurrency}`);
		}
	}

	// Summary
	console.log('\n' + '='.repeat(60));
	console.log('Summary');
	console.log('='.repeat(60));
	console.log('\nConcurrency | Total Time | Avg Request | Success | Rate Limits');
	console.log('-'.repeat(60));

	for (const r of results) {
		console.log(
			`${r.concurrency.toString().padStart(11)} | ${(r.totalDurationMs + 'ms').padStart(10)} | ${(r.avgRequestDurationMs + 'ms').padStart(11)} | ${(r.successCount + '/' + r.termCount).padStart(7)} | ${r.rateLimitHits}`
		);
	}

	// Write full results to file
	const outputPath = '.parallel-test-results.json';
	const output = {
		timestamp: new Date().toISOString(),
		model: MODEL,
		termCount: TEST_TERMS.length,
		results,
	};

	const { writeFileSync } = await import('node:fs');
	writeFileSync(outputPath, JSON.stringify(output, null, 2));
	console.log(`\n[output] Full results written to ${outputPath}`);

	// Recommendation
	const bestResult = results.filter((r) => r.rateLimitHits === 0).sort((a, b) => a.totalDurationMs - b.totalDurationMs)[0];

	if (bestResult) {
		console.log(`\n[recommendation] Optimal concurrency: ${bestResult.concurrency}`);
		console.log(`  - Completes ${TEST_TERMS.length} terms in ${bestResult.totalDurationMs}ms`);
		console.log(`  - No rate limit errors`);
	} else {
		console.log('\n[recommendation] All concurrency levels hit rate limits.');
		console.log('  Consider using concurrency=1 with backoff.');
	}
}

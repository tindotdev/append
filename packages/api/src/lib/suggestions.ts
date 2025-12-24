/**
 * Suggestion generation module for Step 3.
 * Provides stub and OpenAI implementations for generating bucket + one-liner suggestions.
 */

import { BUCKET, type Bucket } from "../db/domain.schema";

// =============================================================================
// Constants
// =============================================================================

export const SUGGESTION_MODEL = "gpt-5-mini";
export const PROMPT_VERSION = 1;
export const MAX_SUGGESTION_ATTEMPTS = 3;
export const SUGGESTION_TIMEOUT_MS = 15_000;
export const MAX_CONCURRENCY = 5;
export const DEFAULT_LIMIT = 50;
export const MIN_LIMIT = 1;
export const MAX_LIMIT = 200;
export const MAX_TEXT_LENGTH = 500;

// =============================================================================
// Prompt templates (version 1)
// =============================================================================

const SYSTEM_PROMPT_V1 = `You generate suggestions for a personal vocabulary app. Output MUST be valid JSON with exactly two keys: "bucket" and "text".
Rules:
- "bucket" MUST be exactly one of: foundations, backend, frontend, dx-tooling, deep-concepts
- "text" MUST be a single line (no newline characters) and MUST be <= 500 characters
- Do not include markdown, code fences, explanations, or any extra keys`;

const userPromptV1 = (term: string): string => `Term: "${term}"
Return JSON only.`;

// =============================================================================
// Types
// =============================================================================

export type SuggestionProvider = "stub" | "openai" | "disabled";

export interface SuggestionResult {
	bucket: Bucket;
	text: string;
}

export interface SuggestionError {
	code: string;
	message: string;
}

export type SuggestionOutcome =
	| { success: true; result: SuggestionResult }
	| { success: false; error: SuggestionError };

export interface AIGatewayConfig {
	cfToken: string;
	gatewayBaseUrl: string;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Normalize suggestion text: trim, collapse whitespace, replace newlines with spaces.
 */
export function normalizeText(text: string): string {
	return text
		.trim()
		.replace(/[\r\n]+/g, " ")
		.replace(/\s+/g, " ");
}

/**
 * Validate and parse a suggestion response.
 */
export function validateSuggestion(raw: unknown): SuggestionOutcome {
	// Type guard
	if (typeof raw !== "object" || raw === null) {
		return {
			success: false,
			error: { code: "INVALID_RESPONSE", message: "Response is not an object" },
		};
	}

	const obj = raw as Record<string, unknown>;

	// Validate bucket
	if (typeof obj.bucket !== "string") {
		return {
			success: false,
			error: { code: "INVALID_BUCKET", message: "bucket is not a string" },
		};
	}

	const bucket = obj.bucket as string;
	if (!BUCKET.includes(bucket as Bucket)) {
		return {
			success: false,
			error: {
				code: "INVALID_BUCKET",
				message: `bucket "${bucket}" is not a valid bucket`,
			},
		};
	}

	// Validate text
	if (typeof obj.text !== "string") {
		return {
			success: false,
			error: { code: "INVALID_TEXT", message: "text is not a string" },
		};
	}

	const normalizedText = normalizeText(obj.text);

	if (normalizedText.length === 0) {
		return {
			success: false,
			error: { code: "INVALID_TEXT", message: "text is empty after trimming" },
		};
	}

	if (normalizedText.length > MAX_TEXT_LENGTH) {
		return {
			success: false,
			error: {
				code: "INVALID_TEXT",
				message: `text exceeds ${MAX_TEXT_LENGTH} characters`,
			},
		};
	}

	return {
		success: true,
		result: {
			bucket: bucket as Bucket,
			text: normalizedText,
		},
	};
}

// =============================================================================
// Stub provider (deterministic, for testing)
// =============================================================================

/**
 * Simple hash function for deterministic bucket selection.
 */
function simpleHash(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	return Math.abs(hash);
}

/**
 * Stub suggestion generator - deterministic based on normalized term.
 */
export function generateStubSuggestion(normalizedTerm: string): SuggestionResult {
	const bucketIndex = simpleHash(normalizedTerm) % BUCKET.length;
	const bucket = BUCKET[bucketIndex];
	const text = `One-liner for: ${normalizedTerm}`;

	return { bucket, text };
}

// =============================================================================
// OpenAI provider (via AI Gateway)
// =============================================================================

/**
 * Generate suggestion using OpenAI API via Cloudflare AI Gateway (Unified Billing).
 * Uses cf-aig-authorization header for Cloudflare token auth instead of OpenAI API key.
 */
export async function generateOpenAISuggestion(
	term: string,
	config: AIGatewayConfig,
	signal?: AbortSignal
): Promise<SuggestionOutcome> {
	const url = `${config.gatewayBaseUrl}/v1/chat/completions`;

	const requestBody = {
		model: SUGGESTION_MODEL,
		temperature: 0,
		max_tokens: 200,
		messages: [
			{
				role: "system",
				content: SYSTEM_PROMPT_V1,
			},
			{
				role: "user",
				content: userPromptV1(term),
			},
		],
	};

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"cf-aig-authorization": `Bearer ${config.cfToken}`,
				"content-type": "application/json",
			},
			body: JSON.stringify(requestBody),
			signal,
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => "Unknown error");
			return {
				success: false,
				error: {
					code: "PROVIDER_ERROR",
					message: `OpenAI API error: ${response.status} ${errorText.slice(0, 200)}`,
				},
			};
		}

		const data = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};

		const content = data.choices?.[0]?.message?.content;
		if (!content) {
			return {
				success: false,
				error: { code: "EMPTY_RESPONSE", message: "No content in response" },
			};
		}

		// Parse JSON from response
		let parsed: unknown;
		try {
			parsed = JSON.parse(content);
		} catch {
			return {
				success: false,
				error: {
					code: "INVALID_JSON",
					message: `Failed to parse response as JSON: ${content.slice(0, 100)}`,
				},
			};
		}

		return validateSuggestion(parsed);
	} catch (error) {
		if (error instanceof Error) {
			if (error.name === "AbortError") {
				return {
					success: false,
					error: { code: "TIMEOUT", message: "Request timed out" },
				};
			}
			return {
				success: false,
				error: { code: "NETWORK_ERROR", message: error.message },
			};
		}
		return {
			success: false,
			error: { code: "UNKNOWN_ERROR", message: "Unknown error occurred" },
		};
	}
}

// =============================================================================
// Concurrency limiter
// =============================================================================

/**
 * Process items with bounded concurrency.
 */
export async function processConcurrently<T, R>(
	items: T[],
	concurrency: number,
	processor: (item: T) => Promise<R>
): Promise<R[]> {
	const results: R[] = [];
	const executing: Promise<void>[] = [];

	for (const item of items) {
		const p = processor(item).then((result) => {
			results.push(result);
		});

		executing.push(p);

		if (executing.length >= concurrency) {
			await Promise.race(executing);
			// Remove completed promises
			for (let i = executing.length - 1; i >= 0; i--) {
				// Check if promise is settled by using Promise.race with a resolved promise
				const settled = await Promise.race([
					executing[i].then(() => true),
					Promise.resolve(false),
				]);
				if (settled) {
					executing.splice(i, 1);
				}
			}
		}
	}

	await Promise.all(executing);
	return results;
}

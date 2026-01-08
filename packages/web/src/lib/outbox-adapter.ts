/**
 * App-specific outbox adapter.
 *
 * This module provides the application-specific configuration for the
 * @append/outbox package, including:
 * - Command and result types
 * - Transport implementation (HTTP calls to the API)
 * - Result payload factory for broadcasts
 *
 * The generic outbox package handles queuing, persistence, cross-tab
 * coordination, and retry logic. This adapter handles the app-specific
 * API contract.
 */

import {
	classifyResponse,
	createOutbox as createGenericOutbox,
	isNetworkError,
	type OutboxItem,
	type Transport,
	type TransportResult,
} from '@append/outbox';
import { api, buildApiRequestError } from './api-rpc';

// =============================================================================
// App-Specific Types
// =============================================================================

/**
 * Request payload for capturing terms (matches POST /api/batch body).
 */
export interface CaptureTermsRequest {
	/** Newline-separated terms */
	terms: string;
	/** UUID for idempotency */
	clientRequestId: string;
}

/**
 * Command to capture terms via POST /api/batch.
 */
export interface CaptureTermsCommand {
	type: 'capture_terms';
	request: CaptureTermsRequest;
}

/**
 * Union of all outbox command types.
 * v1: Only capture_terms is supported.
 */
export type OutboxCommand = CaptureTermsCommand;

/**
 * Result data from a successful capture_terms command.
 */
export interface CaptureTermsResult {
	batchId: string;
}

/**
 * Broadcast result payload for capture_terms.
 */
export interface OutboxBroadcastResult {
	commandType: 'capture_terms';
	itemId: string;
	batchId: string;
}

/**
 * Options for enqueueing a capture_terms command.
 */
export interface EnqueueOptions {
	/** Newline-separated terms */
	terms: string;
}

// =============================================================================
// Transport Implementation
// =============================================================================

/**
 * Send a capture_terms command to the API.
 */
async function sendCaptureTerms(command: CaptureTermsCommand): Promise<TransportResult<CaptureTermsResult>> {
	try {
		const res = await api.api.batch.$post({
			json: command.request,
		});

		const status = res.status;

		if (res.ok) {
			const body = (await res.json()) as { id: string };
			return { outcome: 'success', result: { batchId: body.id } };
		}

		// Parse error response
		const error = await buildApiRequestError(res);
		const classification = classifyResponse(status, error.code);

		const outboxError = {
			status,
			code: error.code,
			message: error.message,
		};

		switch (classification.type) {
			case 'blocked_auth':
				return { outcome: 'blocked_auth', error: outboxError };
			case 'failed':
				return { outcome: 'failed', error: outboxError };
			default:
				return { outcome: 'retry', error: outboxError };
		}
	} catch (err) {
		// Network error - retryable
		if (isNetworkError(err)) {
			return {
				outcome: 'retry',
				error: { message: 'Network error' },
			};
		}
		// Unknown error - treat as retryable
		return {
			outcome: 'retry',
			error: { message: err instanceof Error ? err.message : 'Unknown error' },
		};
	}
}

/**
 * Create the app-specific transport for outbox commands.
 */
export function createAppTransport(): Transport<OutboxCommand, CaptureTermsResult> {
	return {
		async execute(command: OutboxCommand): Promise<TransportResult<CaptureTermsResult>> {
			// v1: Only capture_terms is supported
			// When more command types are added, use a switch statement
			return sendCaptureTerms(command);
		},
	};
}

// =============================================================================
// Outbox Factory
// =============================================================================

/**
 * Options for creating an app outbox instance.
 */
export interface CreateAppOutboxOptions {
	/** User scope for isolation (typically session.user.id) */
	userScope: string;
	/** Called when an item is blocked on auth */
	onAuthBlocked?: () => void;
}

/**
 * Create a fully configured outbox instance for the app.
 *
 * This wraps the generic outbox with app-specific:
 * - Transport (API calls)
 * - Command factory
 * - Result payload factory
 */
export function createAppOutbox(options: CreateAppOutboxOptions) {
	const { userScope, onAuthBlocked } = options;

	return createGenericOutbox<OutboxCommand, CaptureTermsResult, EnqueueOptions>({
		userScope,
		transport: createAppTransport(),
		createCommand: (opts: EnqueueOptions): OutboxCommand => ({
			type: 'capture_terms',
			request: {
				terms: opts.terms,
				clientRequestId: crypto.randomUUID(),
			},
		}),
		createResultPayload: (item: OutboxItem<OutboxCommand>, result: CaptureTermsResult): OutboxBroadcastResult => ({
			commandType: 'capture_terms',
			itemId: item.id,
			batchId: result.batchId,
		}),
		onAuthBlocked,
	});
}

// Re-export types and utilities from the package that the app needs
export {
	createLeadershipProvider,
	deleteOutboxDatabase,
	generateTabId,
	type LeadershipProvider,
	type OutboxBroadcastMessage,
	type OutboxCounts,
	type OutboxItem,
	type OutboxStatus,
	UNDO_GRACE_MS,
} from '@append/outbox';

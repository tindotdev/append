/**
 * Outbox sender loop, enqueue, and undo helpers.
 *
 * The sender loop processes due items one at a time (FIFO by nextAttemptAt):
 * - On success: delete item, broadcast result
 * - On retry: increment attempt, schedule next attempt with backoff
 * - On blocked_auth: mark blocked, pause until auth resumes
 * - On failed: mark as permanently failed
 *
 * Key design decisions:
 * - No durable "sending" state to avoid stuck items after crashes
 * - Single-flight processing (one item at a time)
 * - Respects undoUntil by setting nextAttemptAt = undoUntil for new items
 */

import { api, buildApiRequestError } from '@/lib/api-rpc';
import { UNDO_GRACE_MS } from './constants';
import { calculateNextAttemptAt, classifyResponse, isNetworkError } from './error-classifier';
import type {
	CaptureTermsCommand,
	Clock,
	CommandSender,
	OutboxBroadcast,
	OutboxCommand,
	OutboxError,
	OutboxItem,
	OutboxStore,
	SendResult,
} from './types';

// =============================================================================
// Command Sender Implementation
// =============================================================================

/**
 * Send a capture_terms command to the API.
 */
async function sendCaptureTerms(command: CaptureTermsCommand): Promise<SendResult> {
	try {
		const res = await api.api.batch.$post({
			json: command.request,
		});

		const status = res.status;

		if (res.ok) {
			const body = (await res.json()) as { id: string };
			return { outcome: 'success', batchId: body.id };
		}

		// Parse error response
		const error = await buildApiRequestError(res);
		const classification = classifyResponse(status, error.code);

		const outboxError: OutboxError = {
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
 * Create a command sender that dispatches to the appropriate API endpoint.
 */
export function createCommandSender(): CommandSender {
	return {
		async send(command: OutboxCommand): Promise<SendResult> {
			// v1: Only capture_terms is supported
			// When more command types are added, use a switch statement
			return sendCaptureTerms(command);
		},
	};
}

// =============================================================================
// Sender Loop
// =============================================================================

/**
 * Dependencies for the sender loop.
 */
export interface SenderLoopDeps {
	store: OutboxStore;
	sender: CommandSender;
	broadcast: OutboxBroadcast;
	clock: Clock;
	userScope: string;
	/** Called when an item is blocked on auth */
	onAuthBlocked?: () => void;
}

/**
 * Sender loop interface.
 */
export interface SenderLoop {
	/**
	 * Process all due items once, then return.
	 * @returns true if any items were processed
	 */
	processOnce(): Promise<boolean>;

	/**
	 * Get the timestamp of the next due item (for scheduling).
	 * @returns timestamp in ms, or null if no pending items
	 */
	getNextDueTime(): Promise<number | null>;
}

/**
 * Create a sender loop that processes due items one at a time.
 */
export function createSenderLoop(deps: SenderLoopDeps): SenderLoop {
	const { store, sender, broadcast, clock, userScope, onAuthBlocked } = deps;

	// Track items currently being processed to prevent duplicate sends
	// from rapid processOnce() calls within the same tab
	const inFlight = new Set<string>();

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: intentionally imperative state machine
	async function processOnce(): Promise<boolean> {
		const now = clock.now();
		const dueItems = await store.listDue(now, userScope);

		if (dueItems.length === 0) {
			return false;
		}

		let processedAny = false;

		// Process one at a time (FIFO)
		for (const item of dueItems) {
			// Skip if already being processed by this tab (deduplication)
			if (inFlight.has(item.id)) {
				continue;
			}

			// Double-check item is still due (could have been deleted by undo)
			const current = await store.get(item.id);
			if (!current || current.status !== 'pending') {
				continue;
			}

			// Double-check nextAttemptAt (could have been updated by another tab)
			if (current.nextAttemptAt > clock.now()) {
				continue;
			}

			// Mark as in-flight before sending
			inFlight.add(current.id);

			try {
				processedAny = true;
				const result = await sender.send(current.command);

				switch (result.outcome) {
					case 'success':
						// Delete item and broadcast result
						await store.delete(current.id);
						broadcast.publish({ type: 'outbox_changed', userScope });
						broadcast.publish({
							type: 'outbox_result',
							userScope,
							result: {
								commandType: 'capture_terms',
								itemId: current.id,
								batchId: result.batchId,
							},
						});
						break;

					case 'retry': {
						// Update attempt count and schedule next attempt
						const nextAttemptAt = calculateNextAttemptAt(clock.now(), current.attemptCount);
						const updated: OutboxItem = {
							...current,
							attemptCount: current.attemptCount + 1,
							nextAttemptAt,
							lastError: result.error,
							updatedAt: clock.now(),
						};
						await store.put(updated);
						broadcast.publish({ type: 'outbox_changed', userScope });
						break;
					}

					case 'blocked_auth': {
						// Mark as blocked, notify auth blocked handler
						const blocked: OutboxItem = {
							...current,
							status: 'blocked_auth',
							lastError: result.error,
							updatedAt: clock.now(),
						};
						await store.put(blocked);
						broadcast.publish({ type: 'outbox_changed', userScope });
						onAuthBlocked?.();
						// Stop processing - auth is broken
						return true;
					}

					case 'failed': {
						// Mark as failed permanently
						const failed: OutboxItem = {
							...current,
							status: 'failed',
							lastError: result.error,
							updatedAt: clock.now(),
						};
						await store.put(failed);
						broadcast.publish({ type: 'outbox_changed', userScope });
						break;
					}
				}
			} finally {
				// Always remove from in-flight set when done processing
				inFlight.delete(current.id);
			}
		}

		return processedAny;
	}

	async function getNextDueTime(): Promise<number | null> {
		// Get all pending items and find the one with earliest nextAttemptAt
		const items = await store.listByStatus(userScope, 'pending');
		if (items.length === 0) return null;

		let earliest = Number.POSITIVE_INFINITY;
		for (const item of items) {
			if (item.nextAttemptAt < earliest) {
				earliest = item.nextAttemptAt;
			}
		}
		return earliest === Number.POSITIVE_INFINITY ? null : earliest;
	}

	return {
		processOnce,
		getNextDueTime,
	};
}

// =============================================================================
// Enqueue Helper
// =============================================================================

/**
 * Options for enqueueing a capture_terms command.
 */
export interface EnqueueOptions {
	/** Newline-separated terms */
	terms: string;
}

/**
 * Result of enqueueing a command.
 */
export interface EnqueueResult {
	/** The created outbox item */
	item: OutboxItem<CaptureTermsCommand>;
}

/**
 * Dependencies for the enqueue helper.
 */
export interface EnqueueDeps {
	store: OutboxStore;
	broadcast: OutboxBroadcast;
	clock: Clock;
	userScope: string;
}

/**
 * Create an enqueue helper for capture_terms commands.
 */
export function createEnqueueHelper(deps: EnqueueDeps): (options: EnqueueOptions) => Promise<EnqueueResult> {
	const { store, broadcast, clock, userScope } = deps;

	return async function enqueue(options: EnqueueOptions): Promise<EnqueueResult> {
		const now = clock.now();
		const id = crypto.randomUUID();
		const clientRequestId = crypto.randomUUID();

		const item: OutboxItem<CaptureTermsCommand> = {
			id,
			userScope,
			command: {
				type: 'capture_terms',
				request: {
					terms: options.terms,
					clientRequestId,
				},
			},
			createdAt: now,
			updatedAt: now,
			undoUntil: now + UNDO_GRACE_MS,
			status: 'pending',
			attemptCount: 0,
			nextAttemptAt: now + UNDO_GRACE_MS, // Not eligible until after undo window
		};

		await store.put(item);
		broadcast.publish({ type: 'outbox_changed', userScope });
		broadcast.publish({ type: 'kick' });

		return { item };
	};
}

// =============================================================================
// Undo Helper
// =============================================================================

/**
 * Result of attempting to undo an item.
 */
export interface UndoResult {
	/** Whether the undo was successful */
	success: boolean;
	/** The terms that were restored (if successful) */
	terms?: string;
}

/**
 * Dependencies for the undo helper.
 */
export interface UndoDeps {
	store: OutboxStore;
	broadcast: OutboxBroadcast;
	clock: Clock;
	userScope: string;
}

/**
 * Create an undo helper that can cancel items before they're sent.
 */
export function createUndoHelper(deps: UndoDeps): (itemId: string) => Promise<UndoResult> {
	const { store, broadcast, clock, userScope } = deps;

	return async function undo(itemId: string): Promise<UndoResult> {
		// First, get the item to extract terms for restoration (before deletion)
		const item = await store.get(itemId);
		if (!item) {
			return { success: false }; // Already deleted
		}

		if (item.userScope !== userScope) {
			return { success: false }; // Wrong user
		}

		// Extract terms for restoration before attempting deletion
		const terms = item.command.type === 'capture_terms' ? item.command.request.terms : undefined;

		// Use atomic deleteIf to prevent TOCTOU race condition:
		// The item could be sent between our check and delete, so we verify
		// both status=pending AND time window in a single transaction
		const now = clock.now();
		const deleted = await store.deleteIf(itemId, (current) => {
			return current.status === 'pending' && now < current.undoUntil;
		});

		if (!deleted) {
			return { success: false }; // Undo window expired or item already sent
		}

		broadcast.publish({ type: 'outbox_changed', userScope });
		return { success: true, terms };
	};
}

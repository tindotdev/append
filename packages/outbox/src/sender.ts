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

import { UNDO_GRACE_MS } from './constants';
import { calculateNextAttemptAt } from './error-classifier';
import type { Transport, TransportResult } from './transport';
import type { Clock, OutboxBroadcast, OutboxItem, OutboxStore } from './types';

// =============================================================================
// Sender Loop
// =============================================================================

/**
 * Dependencies for the sender loop.
 */
export interface SenderLoopDeps<TCommand, TResult, TBroadcastResult = unknown> {
	store: OutboxStore<TCommand>;
	transport: Transport<TCommand, TResult>;
	broadcast: OutboxBroadcast<TBroadcastResult>;
	clock: Clock;
	userScope: string;
	/** Called when an item is blocked on auth */
	onAuthBlocked?: () => void;
	/** Creates a result payload for broadcast (application-specific) */
	createResultPayload: (item: OutboxItem<TCommand>, result: TResult) => TBroadcastResult;
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
export function createSenderLoop<TCommand, TResult, TBroadcastResult = unknown>(
	deps: SenderLoopDeps<TCommand, TResult, TBroadcastResult>
): SenderLoop {
	const { store, transport, broadcast, clock, userScope, onAuthBlocked, createResultPayload } = deps;

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
				const result: TransportResult<TResult> = await transport.execute(current.command);

				switch (result.outcome) {
					case 'success':
						// Delete item and broadcast result
						await store.delete(current.id);
						broadcast.publish({ type: 'outbox_changed', userScope });
						broadcast.publish({
							type: 'outbox_result',
							userScope,
							result: createResultPayload(current, result.result),
						});
						break;

					case 'retry': {
						// Update attempt count and schedule next attempt
						const nextAttemptAt = calculateNextAttemptAt(clock.now(), current.attemptCount);
						const updated: OutboxItem<TCommand> = {
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
						const blocked: OutboxItem<TCommand> = {
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
						const failed: OutboxItem<TCommand> = {
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
 * Result of enqueueing a command.
 */
export interface EnqueueResult<TCommand> {
	/** The created outbox item */
	item: OutboxItem<TCommand>;
}

/**
 * Dependencies for the enqueue helper.
 */
export interface EnqueueDeps<TCommand> {
	store: OutboxStore<TCommand>;
	broadcast: OutboxBroadcast;
	clock: Clock;
	userScope: string;
	/** Grace period in ms during which undo is allowed (default: UNDO_GRACE_MS) */
	undoGraceMs?: number;
}

/**
 * Create an enqueue helper for any command type.
 *
 * @param deps - Dependencies
 * @param createCommand - Factory function to create a command from options
 */
export function createEnqueueHelper<TCommand, TOptions>(
	deps: EnqueueDeps<TCommand>,
	createCommand: (options: TOptions) => TCommand
): (options: TOptions) => Promise<EnqueueResult<TCommand>> {
	const { store, broadcast, clock, userScope, undoGraceMs = UNDO_GRACE_MS } = deps;

	return async function enqueue(options: TOptions): Promise<EnqueueResult<TCommand>> {
		const now = clock.now();
		const id = crypto.randomUUID();

		const item: OutboxItem<TCommand> = {
			id,
			userScope,
			command: createCommand(options),
			createdAt: now,
			updatedAt: now,
			undoUntil: now + undoGraceMs,
			status: 'pending',
			attemptCount: 0,
			nextAttemptAt: now + undoGraceMs, // Not eligible until after undo window
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
export interface UndoResult<TCommand> {
	/** Whether the undo was successful */
	success: boolean;
	/** The original command (if successful, for restoring UI state) */
	command?: TCommand;
}

/**
 * Dependencies for the undo helper.
 */
export interface UndoDeps<TCommand> {
	store: OutboxStore<TCommand>;
	broadcast: OutboxBroadcast;
	clock: Clock;
	userScope: string;
}

/**
 * Create an undo helper that can cancel items before they're sent.
 */
export function createUndoHelper<TCommand>(deps: UndoDeps<TCommand>): (itemId: string) => Promise<UndoResult<TCommand>> {
	const { store, broadcast, clock, userScope } = deps;

	return async function undo(itemId: string): Promise<UndoResult<TCommand>> {
		// First, get the item to extract command for restoration (before deletion)
		const item = await store.get(itemId);
		if (!item) {
			return { success: false }; // Already deleted
		}

		if (item.userScope !== userScope) {
			return { success: false }; // Wrong user
		}

		// Extract command for restoration before attempting deletion
		const command = item.command;

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
		return { success: true, command };
	};
}

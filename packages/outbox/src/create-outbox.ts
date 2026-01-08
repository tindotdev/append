/**
 * Outbox factory - creates a fully wired outbox instance.
 *
 * This is the main entry point for creating an outbox. It wires all
 * dependencies together and returns an interface for enqueueing commands,
 * undoing items, and running the sender loop.
 */

import { createOutboxBroadcast } from './broadcast';
import type { EnqueueResult, ProcessOutcome, SenderLoop, UndoResult } from './sender';
import { createEnqueueHelper, createSenderLoop, createUndoHelper } from './sender';
import { createOutboxStore } from './store';
import type { Transport } from './transport';
import type { Clock, OutboxBroadcast, OutboxItem, OutboxStore } from './types';

// Re-export ProcessOutcome for consumers
export type { ProcessOutcome } from './sender';

/**
 * Options for creating an outbox instance.
 *
 * @template TCommand - The command type (application-specific)
 * @template TResult - The transport result type (application-specific)
 * @template TEnqueueOptions - The enqueue options type (application-specific)
 * @template TBroadcastResult - The broadcast result payload type (application-specific, defaults to unknown)
 */
export interface CreateOutboxOptions<TCommand, TResult, TEnqueueOptions, TBroadcastResult = unknown> {
	/** User scope for isolation (typically session.user.id) */
	userScope: string;
	/** Transport for sending commands to the server */
	transport: Transport<TCommand, TResult>;
	/** Factory function to create a command from enqueue options */
	createCommand: (options: TEnqueueOptions) => TCommand;
	/** Creates a result payload for broadcast (application-specific) */
	createResultPayload: (item: OutboxItem<TCommand>, result: TResult) => TBroadcastResult;
	/** Clock for time operations (default: Date.now) */
	clock?: Clock;
	/** Called when an item is blocked on auth */
	onAuthBlocked?: () => void;
	/**
	 * Maximum number of retry attempts before marking item as failed.
	 * Default: undefined (unlimited retries with exponential backoff)
	 */
	maxAttempts?: number;
	/**
	 * Called after each item is processed (for observability).
	 * Includes the item and the outcome of the processing attempt.
	 */
	onItemProcessed?: (item: OutboxItem<TCommand>, outcome: ProcessOutcome) => void;
	/**
	 * Called when a retry is scheduled (for observability).
	 * Includes the item and the delay in ms until the next attempt.
	 */
	onRetryScheduled?: (item: OutboxItem<TCommand>, delayMs: number) => void;
}

/**
 * Result of attempting to retry a failed item.
 */
export interface RetryResult<TCommand> {
	/** Whether the retry was initiated */
	success: boolean;
	/** The updated item (if successful) */
	item?: OutboxItem<TCommand>;
	/** Error message (if unsuccessful) */
	error?: string;
}

/**
 * A fully wired outbox instance.
 *
 * @template TCommand - The command type (application-specific)
 * @template TEnqueueOptions - The enqueue options type (application-specific)
 * @template TBroadcastResult - The broadcast result payload type (application-specific, defaults to unknown)
 */
export interface OutboxInstance<TCommand, TEnqueueOptions, TBroadcastResult = unknown> {
	/** The underlying store (for direct access if needed) */
	store: OutboxStore<TCommand>;
	/** The broadcast channel (for subscribing to events) */
	broadcast: OutboxBroadcast<TBroadcastResult>;
	/** Enqueue a command */
	enqueue: (options: TEnqueueOptions) => Promise<EnqueueResult<TCommand>>;
	/** Attempt to undo an item (only works within grace window) */
	undo: (itemId: string) => Promise<UndoResult<TCommand>>;
	/** The sender loop (for processing due items) */
	senderLoop: SenderLoop;
	/**
	 * Retry a failed item by resetting it to pending status.
	 * Only works for items with status 'failed'.
	 */
	retry: (itemId: string) => Promise<RetryResult<TCommand>>;
	/**
	 * Close the outbox and release resources.
	 * Closes the store and broadcast channel.
	 */
	close: () => void;
}

/**
 * Create a fully wired outbox instance.
 *
 * @example
 * ```typescript
 * // Define your command type
 * interface MyCommand {
 *   type: 'capture_terms';
 *   request: { terms: string; clientRequestId: string };
 * }
 *
 * // Define your result type
 * interface MyResult {
 *   batchId: string;
 * }
 *
 * // Create the outbox
 * const outbox = createOutbox({
 *   userScope: session.user.id,
 *   transport: myTransport,
 *   createCommand: (options: { terms: string }) => ({
 *     type: 'capture_terms',
 *     request: { terms: options.terms, clientRequestId: crypto.randomUUID() },
 *   }),
 *   createResultPayload: (item, result) => ({
 *     commandType: item.command.type,
 *     itemId: item.id,
 *     batchId: result.batchId,
 *   }),
 *   onAuthBlocked: () => showSignInPrompt(),
 * });
 *
 * // Enqueue a command
 * const { item } = await outbox.enqueue({ terms: 'term1\nterm2' });
 *
 * // Subscribe to events
 * outbox.broadcast.subscribe((msg) => {
 *   if (msg.type === 'outbox_result') {
 *     console.log('Result:', msg.result);
 *   }
 * });
 *
 * // Process due items (typically done by leader only)
 * await outbox.senderLoop.processOnce();
 * ```
 */
export function createOutbox<TCommand, TResult, TEnqueueOptions, TBroadcastResult = unknown>(
	options: CreateOutboxOptions<TCommand, TResult, TEnqueueOptions, TBroadcastResult>
): OutboxInstance<TCommand, TEnqueueOptions, TBroadcastResult> {
	const { userScope, transport, createCommand, createResultPayload, onAuthBlocked, maxAttempts, onItemProcessed, onRetryScheduled } =
		options;
	const clock = options.clock ?? { now: () => Date.now() };

	const store = createOutboxStore<TCommand>(userScope);
	const broadcast = createOutboxBroadcast<TBroadcastResult>();

	const senderLoop = createSenderLoop<TCommand, TResult, TBroadcastResult>({
		store,
		transport,
		broadcast,
		clock,
		userScope,
		onAuthBlocked,
		createResultPayload,
		maxAttempts,
		onItemProcessed,
		onRetryScheduled,
	});

	const enqueue = createEnqueueHelper({ store, broadcast, clock, userScope }, createCommand);

	const undo = createUndoHelper({
		store,
		broadcast,
		clock,
		userScope,
	});

	async function retry(itemId: string): Promise<RetryResult<TCommand>> {
		const item = await store.get(itemId);
		if (!item) {
			return { success: false, error: 'Item not found' };
		}
		if (item.userScope !== userScope) {
			return { success: false, error: 'Item belongs to different user' };
		}
		if (item.status !== 'failed') {
			return { success: false, error: `Cannot retry item with status '${item.status}'` };
		}

		// Reset item to pending with immediate retry
		const updated: OutboxItem<TCommand> = {
			...item,
			status: 'pending',
			attemptCount: 0,
			nextAttemptAt: clock.now(), // Immediate retry
			lastError: undefined,
			updatedAt: clock.now(),
		};
		await store.put(updated);
		broadcast.publish({ type: 'outbox_changed', userScope });
		broadcast.publish({ type: 'kick' });

		return { success: true, item: updated };
	}

	function close(): void {
		store.close();
		broadcast.close();
	}

	return {
		store,
		broadcast,
		enqueue,
		undo,
		senderLoop,
		retry,
		close,
	};
}

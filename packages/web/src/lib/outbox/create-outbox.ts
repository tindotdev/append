/**
 * Outbox factory - creates a fully wired outbox instance.
 *
 * This is the main entry point for creating an outbox. It wires all
 * dependencies together and returns an interface for enqueueing commands,
 * undoing items, and running the sender loop.
 */

import { createOutboxBroadcast } from './broadcast';
import type { EnqueueResult, SenderLoop, UndoResult } from './sender';
import { createCommandSender, createEnqueueHelper, createSenderLoop, createUndoHelper } from './sender';
import { createOutboxStore } from './store';
import type { Clock, OutboxBroadcast, OutboxStore } from './types';

/**
 * Options for creating an outbox instance.
 */
export interface CreateOutboxOptions {
	/** User scope for isolation (typically session.user.id) */
	userScope: string;
	/** Clock for time operations (default: Date.now) */
	clock?: Clock;
	/** Called when an item is blocked on auth */
	onAuthBlocked?: () => void;
}

/**
 * A fully wired outbox instance.
 */
export interface OutboxInstance {
	/** The underlying store (for direct access if needed) */
	store: OutboxStore;
	/** The broadcast channel (for subscribing to events) */
	broadcast: OutboxBroadcast;
	/** Enqueue a capture_terms command */
	enqueue: (options: { terms: string }) => Promise<EnqueueResult>;
	/** Attempt to undo an item (only works within grace window) */
	undo: (itemId: string) => Promise<UndoResult>;
	/** The sender loop (for processing due items) */
	senderLoop: SenderLoop;
}

/**
 * Create a fully wired outbox instance.
 *
 * @example
 * ```typescript
 * const outbox = createOutbox({
 *   userScope: session.user.id,
 *   onAuthBlocked: () => showSignInPrompt(),
 * });
 *
 * // Enqueue a capture
 * const { item } = await outbox.enqueue({ terms: 'term1\nterm2' });
 *
 * // Subscribe to events
 * outbox.broadcast.subscribe((msg) => {
 *   if (msg.type === 'outbox_result') {
 *     console.log('Batch ready:', msg.result.batchId);
 *   }
 * });
 *
 * // Process due items (typically done by leader only)
 * await outbox.senderLoop.processOnce();
 * ```
 */
export function createOutbox(options: CreateOutboxOptions): OutboxInstance {
	const { userScope, onAuthBlocked } = options;
	const clock = options.clock ?? { now: () => Date.now() };

	const store = createOutboxStore(userScope);
	const broadcast = createOutboxBroadcast();
	const sender = createCommandSender();

	const senderLoop = createSenderLoop({
		store,
		sender,
		broadcast,
		clock,
		userScope,
		onAuthBlocked,
	});

	const enqueue = createEnqueueHelper({
		store,
		broadcast,
		clock,
		userScope,
	});

	const undo = createUndoHelper({
		store,
		broadcast,
		clock,
		userScope,
	});

	return {
		store,
		broadcast,
		enqueue,
		undo,
		senderLoop,
	};
}

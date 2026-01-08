/**
 * Outbox factory - creates a fully wired outbox instance.
 *
 * This is the main entry point for creating an outbox. It wires all
 * dependencies together and returns an interface for enqueueing commands,
 * undoing items, and running the sender loop.
 */

import { createOutboxBroadcast } from './broadcast';
import type { EnqueueResult, SenderLoop, UndoResult } from './sender';
import { createEnqueueHelper, createSenderLoop, createUndoHelper } from './sender';
import { createOutboxStore } from './store';
import type { Transport } from './transport';
import type { Clock, OutboxBroadcast, OutboxItem, OutboxStore } from './types';

/**
 * Options for creating an outbox instance.
 */
export interface CreateOutboxOptions<TCommand, TResult, TEnqueueOptions> {
	/** User scope for isolation (typically session.user.id) */
	userScope: string;
	/** Transport for sending commands to the server */
	transport: Transport<TCommand, TResult>;
	/** Factory function to create a command from enqueue options */
	createCommand: (options: TEnqueueOptions) => TCommand;
	/** Creates a result payload for broadcast (application-specific) */
	createResultPayload: (item: OutboxItem<TCommand>, result: TResult) => unknown;
	/** Clock for time operations (default: Date.now) */
	clock?: Clock;
	/** Called when an item is blocked on auth */
	onAuthBlocked?: () => void;
}

/**
 * A fully wired outbox instance.
 */
export interface OutboxInstance<TCommand, TEnqueueOptions> {
	/** The underlying store (for direct access if needed) */
	store: OutboxStore<TCommand>;
	/** The broadcast channel (for subscribing to events) */
	broadcast: OutboxBroadcast;
	/** Enqueue a command */
	enqueue: (options: TEnqueueOptions) => Promise<EnqueueResult<TCommand>>;
	/** Attempt to undo an item (only works within grace window) */
	undo: (itemId: string) => Promise<UndoResult<TCommand>>;
	/** The sender loop (for processing due items) */
	senderLoop: SenderLoop;
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
export function createOutbox<TCommand, TResult, TEnqueueOptions>(
	options: CreateOutboxOptions<TCommand, TResult, TEnqueueOptions>
): OutboxInstance<TCommand, TEnqueueOptions> {
	const { userScope, transport, createCommand, createResultPayload, onAuthBlocked } = options;
	const clock = options.clock ?? { now: () => Date.now() };

	const store = createOutboxStore<TCommand>(userScope);
	// Use unknown for broadcast result type since it's app-specific
	const broadcast = createOutboxBroadcast<unknown>();

	const senderLoop = createSenderLoop<TCommand, TResult, unknown>({
		store,
		transport,
		broadcast,
		clock,
		userScope,
		onAuthBlocked,
		createResultPayload,
	});

	const enqueue = createEnqueueHelper({ store, broadcast, clock, userScope }, createCommand);

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

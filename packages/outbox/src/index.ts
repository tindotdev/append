/**
 * @append/outbox - A durable offline-first queue with cross-tab coordination.
 *
 * This package provides a generic outbox pattern implementation for
 * client-side durable queuing with:
 * - IndexedDB persistence
 * - Cross-tab coordination via Web Locks and BroadcastChannel
 * - Exponential backoff with jitter
 * - Undo grace window
 * - Auth-blocked item handling
 *
 * @example
 * ```typescript
 * import { createOutbox, type Transport } from '@append/outbox';
 *
 * // Define your transport
 * const transport: Transport<MyCommand, MyResult> = {
 *   async execute(command) {
 *     const res = await fetch('/api/endpoint', { method: 'POST', body: JSON.stringify(command) });
 *     if (res.ok) return { outcome: 'success', result: await res.json() };
 *     // ... classify errors
 *   }
 * };
 *
 * // Create the outbox
 * const outbox = createOutbox({
 *   userScope: userId,
 *   transport,
 *   createCommand: (options) => ({ type: 'my_command', ...options }),
 *   createResultPayload: (item, result) => ({ itemId: item.id, ...result }),
 * });
 *
 * // Enqueue and process
 * await outbox.enqueue({ data: 'hello' });
 * await outbox.senderLoop.processOnce();
 * ```
 */

// =============================================================================
// Factory
// =============================================================================

export { type CreateOutboxOptions, createOutbox, type OutboxInstance } from './create-outbox';

// =============================================================================
// Types
// =============================================================================

export type {
	Clock,
	KickMessage,
	OutboxBroadcast,
	OutboxBroadcastMessage,
	OutboxChangedMessage,
	OutboxCounts,
	OutboxError,
	OutboxItem,
	OutboxResultMessage,
	OutboxStatus,
	OutboxStore,
} from './types';

// =============================================================================
// Transport
// =============================================================================

export type { Transport, TransportResult } from './transport';

// =============================================================================
// Sender
// =============================================================================

export type { EnqueueDeps, EnqueueResult, SenderLoop, SenderLoopDeps, UndoDeps, UndoResult } from './sender';

export { createEnqueueHelper, createSenderLoop, createUndoHelper } from './sender';

// =============================================================================
// Store
// =============================================================================

export { createMockOutboxStore, createOutboxStore, deleteOutboxDatabase, getDatabaseName, openDatabase } from './store';

// =============================================================================
// Broadcast
// =============================================================================

export { createMockBroadcast, createOutboxBroadcast } from './broadcast';

// =============================================================================
// Leadership
// =============================================================================

export {
	createLeadershipProvider,
	createLeaseProvider,
	createLeaseStore,
	createMockLeaseStore,
	createWebLocksProvider,
	generateTabId,
	type LeadershipDeps,
	type LeadershipProvider,
	type LeadershipSession,
	type LeaseRecord,
	type LeaseStore,
	type LeaseStoreOptions,
} from './leadership';

// =============================================================================
// Error Classification
// =============================================================================

export {
	type BackoffOptions,
	calculateNextAttemptAt,
	classifyResponse,
	isAuthBlocked,
	isNetworkError,
	isPermanentFailure,
	isRetryableStatus,
	type ResponseClassification,
} from './error-classifier';

// =============================================================================
// Constants
// =============================================================================

export {
	BACKOFF_BASE_MS,
	BACKOFF_CAP_MS,
	BROADCAST_CHANNEL_NAME,
	HEARTBEAT_MS,
	IDB_STORE_NAME,
	IDB_VERSION,
	JITTER_RANGE_MS,
	LEASE_MS,
	LEASE_STORE_NAME,
	UNDO_GRACE_MS,
} from './constants';

/**
 * Outbox module - client-side queue for durable, retry-safe API submissions.
 *
 * @module outbox
 *
 * @example Basic usage
 * ```typescript
 * import { createOutbox } from '@/lib/outbox';
 *
 * const outbox = createOutbox({
 *   userScope: session.user.id,
 *   onAuthBlocked: () => showSignInPrompt(),
 * });
 *
 * // Enqueue a capture
 * const { item } = await outbox.enqueue({ terms: 'term1\nterm2' });
 *
 * // Undo within grace window
 * const { success, terms } = await outbox.undo(item.id);
 *
 * // Subscribe to events
 * const unsubscribe = outbox.broadcast.subscribe((msg) => {
 *   if (msg.type === 'outbox_result') {
 *     console.log('Batch ready:', msg.result.batchId);
 *   }
 * });
 *
 * // Process due items (leader only)
 * await outbox.senderLoop.processOnce();
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
	// Command types
	CaptureTermsCommand,
	CaptureTermsRequest,
	// DI interfaces
	Clock,
	CommandSender,
	// Broadcast messages
	KickMessage,
	OutboxBroadcast,
	OutboxBroadcastMessage,
	OutboxChangedMessage,
	OutboxCommand,
	OutboxCounts,
	OutboxError,
	// Item and status
	OutboxItem,
	OutboxResultMessage,
	OutboxStatus,
	OutboxStore,
	// Send result
	SendResult,
} from './types';

// =============================================================================
// Constants
// =============================================================================

export {
	// Retry backoff
	BACKOFF_BASE_MS,
	BACKOFF_CAP_MS,
	// BroadcastChannel
	BROADCAST_CHANNEL_NAME,
	HEARTBEAT_MS,
	IDB_STORE_NAME,
	// IndexedDB
	IDB_VERSION,
	JITTER_RANGE_MS,
	// Leadership (for cross-tab coordination)
	LEASE_MS,
	LEASE_STORE_NAME,
	// Undo grace window
	UNDO_GRACE_MS,
} from './constants';

// =============================================================================
// Store
// =============================================================================

export { createMockOutboxStore, createOutboxStore, deleteOutboxDatabase, getDatabaseName } from './store';

// =============================================================================
// Error Classification
// =============================================================================

export {
	type BackoffOptions,
	type ClassifiedResponse,
	calculateNextAttemptAt,
	classifyResponse,
	isAuthBlocked,
	isNetworkError,
	isPermanentFailure,
	isRetryableStatus,
} from './error-classifier';

// =============================================================================
// Broadcast
// =============================================================================

export { createMockBroadcast, createOutboxBroadcast } from './broadcast';

// =============================================================================
// Sender
// =============================================================================

export {
	createCommandSender,
	createEnqueueHelper,
	createSenderLoop,
	createUndoHelper,
	type EnqueueDeps,
	type EnqueueOptions,
	type EnqueueResult,
	type SenderLoop,
	type SenderLoopDeps,
	type UndoDeps,
	type UndoResult,
} from './sender';

// =============================================================================
// Factory
// =============================================================================

export { type CreateOutboxOptions, createOutbox, type OutboxInstance } from './create-outbox';

// =============================================================================
// Leadership (Cross-Tab Coordination)
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

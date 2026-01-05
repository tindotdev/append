/**
 * Outbox types and interfaces.
 *
 * Defines the data model for the client-side outbox system:
 * - Commands: What to send (v1: capture_terms only)
 * - Items: Queued commands with retry metadata
 * - Status: pending | failed | blocked_auth
 * - DI interfaces: Dependency injection boundaries for testing
 */

// =============================================================================
// Command Types (v1: capture_terms only)
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

// =============================================================================
// Status
// =============================================================================

/**
 * Outbox item status.
 *
 * - pending: Waiting to be sent or scheduled for retry
 * - failed: Permanent failure (will not retry)
 * - blocked_auth: Blocked on authentication (will resume when auth is valid)
 */
export type OutboxStatus = 'pending' | 'failed' | 'blocked_auth';

// =============================================================================
// Error Shape
// =============================================================================

/**
 * Error information stored on an outbox item after a failed attempt.
 */
export interface OutboxError {
	/** HTTP status code (if available) */
	status?: number;
	/** API error code (if available) */
	code?: string;
	/** Human-readable error message */
	message: string;
}

// =============================================================================
// OutboxItem
// =============================================================================

/**
 * An item in the outbox queue.
 *
 * @template T - The command type (defaults to OutboxCommand union)
 */
export interface OutboxItem<T extends OutboxCommand = OutboxCommand> {
	/** Unique identifier (UUID) */
	id: string;
	/** User scope for isolation (derived from session.user.id) */
	userScope: string;
	/** The command to execute (immutable after enqueue) */
	command: T;
	/** Timestamp when the item was created (ms since epoch) */
	createdAt: number;
	/** Timestamp when the item was last updated (ms since epoch) */
	updatedAt: number;
	/** Timestamp until which undo is allowed (ms since epoch) */
	undoUntil: number;
	/** Current status */
	status: OutboxStatus;
	/** Number of send attempts made */
	attemptCount: number;
	/** Timestamp when the next attempt should be made (ms since epoch) */
	nextAttemptAt: number;
	/** Error from the last failed attempt (if any) */
	lastError?: OutboxError;
}

// =============================================================================
// Broadcast Message Types
// =============================================================================

/**
 * Message to wake the leader's sender loop.
 */
export interface KickMessage {
	type: 'kick';
}

/**
 * Message to notify all tabs that outbox state changed.
 */
export interface OutboxChangedMessage {
	type: 'outbox_changed';
	userScope: string;
}

/**
 * Message to notify all tabs of a successful send result.
 */
export interface OutboxResultMessage {
	type: 'outbox_result';
	userScope: string;
	result: {
		commandType: 'capture_terms';
		itemId: string;
		batchId: string;
	};
}

/**
 * Union of all broadcast message types.
 */
export type OutboxBroadcastMessage = KickMessage | OutboxChangedMessage | OutboxResultMessage;

// =============================================================================
// Send Result Types
// =============================================================================

/**
 * Result of sending a command.
 */
export type SendResult =
	| { outcome: 'success'; batchId: string }
	| { outcome: 'retry'; error: OutboxError }
	| { outcome: 'blocked_auth'; error: OutboxError }
	| { outcome: 'failed'; error: OutboxError };

// =============================================================================
// DI Interfaces
// =============================================================================

/**
 * Clock interface for dependency injection.
 * Allows testing with deterministic time.
 */
export interface Clock {
	now(): number;
}

/**
 * BroadcastChannel wrapper interface.
 */
export interface OutboxBroadcast {
	/** Publish a message to all tabs */
	publish(message: OutboxBroadcastMessage): void;
	/** Subscribe to messages, returns unsubscribe function */
	subscribe(handler: (message: OutboxBroadcastMessage) => void): () => void;
}

/**
 * Outbox persistence store interface.
 */
export interface OutboxStore {
	/** Insert or update an item */
	put(item: OutboxItem): Promise<void>;
	/** Get an item by ID */
	get(id: string): Promise<OutboxItem | undefined>;
	/** Delete an item by ID */
	delete(id: string): Promise<void>;
	/** List items that are due to be sent (pending + nextAttemptAt <= now) */
	listDue(now: number, userScope: string): Promise<OutboxItem[]>;
	/** Count items by status */
	countByStatus(userScope: string): Promise<Record<OutboxStatus, number>>;
	/** List items by status */
	listByStatus(userScope: string, status: OutboxStatus): Promise<OutboxItem[]>;
	/**
	 * Resume auth-blocked items by converting them to pending.
	 * Called when authentication is restored.
	 * @returns The number of items that were resumed
	 */
	resumeBlockedAuth(userScope: string, now: number): Promise<number>;
}

/**
 * Command sender interface.
 */
export interface CommandSender {
	/** Send a command and return the result */
	send(command: OutboxCommand): Promise<SendResult>;
}

// =============================================================================
// UI State Types
// =============================================================================

/**
 * Outbox counts for UI indicators.
 */
export interface OutboxCounts {
	pending: number;
	failed: number;
	blocked_auth: number;
}

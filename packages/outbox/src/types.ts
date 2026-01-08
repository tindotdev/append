/**
 * Outbox types and interfaces.
 *
 * Defines the data model for the client-side outbox system:
 * - Items: Queued commands with retry metadata
 * - Status: pending | failed | blocked_auth
 * - DI interfaces: Dependency injection boundaries for testing
 *
 * Note: Command types are application-specific and should be defined
 * by the consuming application via generics.
 */

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
 * @template TCommand - The command type (application-specific)
 */
export interface OutboxItem<TCommand = unknown> {
	/** Unique identifier (UUID) */
	id: string;
	/** User scope for isolation (derived from session.user.id) */
	userScope: string;
	/** The command to execute (immutable after enqueue) */
	command: TCommand;
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
 *
 * @template TResult - The result type (application-specific)
 */
export interface OutboxResultMessage<TResult = unknown> {
	type: 'outbox_result';
	userScope: string;
	result: TResult;
}

/**
 * Union of all broadcast message types.
 */
export type OutboxBroadcastMessage<TResult = unknown> = KickMessage | OutboxChangedMessage | OutboxResultMessage<TResult>;

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
export interface OutboxBroadcast<TResult = unknown> {
	/** Publish a message to all tabs */
	publish(message: OutboxBroadcastMessage<TResult>): void;
	/** Subscribe to messages, returns unsubscribe function */
	subscribe(handler: (message: OutboxBroadcastMessage<TResult>) => void): () => void;
	/** Close the broadcast channel and release resources */
	close(): void;
}

/**
 * Outbox persistence store interface.
 */
export interface OutboxStore<TCommand = unknown> {
	/** Insert or update an item */
	put(item: OutboxItem<TCommand>): Promise<void>;
	/** Get an item by ID */
	get(id: string): Promise<OutboxItem<TCommand> | undefined>;
	/** Delete an item by ID */
	delete(id: string): Promise<void>;
	/** List items that are due to be sent (pending + nextAttemptAt <= now) */
	listDue(now: number, userScope: string): Promise<OutboxItem<TCommand>[]>;
	/** Count items by status */
	countByStatus(userScope: string): Promise<Record<OutboxStatus, number>>;
	/** List items by status */
	listByStatus(userScope: string, status: OutboxStatus): Promise<OutboxItem<TCommand>[]>;
	/**
	 * Resume auth-blocked items by converting them to pending.
	 * Called when authentication is restored.
	 * @returns The number of items that were resumed
	 */
	resumeBlockedAuth(userScope: string, now: number): Promise<number>;
	/**
	 * Atomically delete an item if the predicate returns true.
	 * Used for TOCTOU-safe undo operations.
	 * @returns true if item was deleted, false if not found or predicate failed
	 */
	deleteIf(id: string, predicate: (item: OutboxItem<TCommand>) => boolean): Promise<boolean>;
	/**
	 * Close the database connection and release resources.
	 * Called on user sign-out to prevent memory leaks.
	 */
	close(): void;
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

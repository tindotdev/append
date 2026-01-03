/**
 * Leadership types for cross-tab coordination.
 *
 * The leadership system ensures only one tab runs the sender loop at a time.
 * Primary: Web Locks API (navigator.locks)
 * Fallback: IndexedDB lease with TTL + heartbeat
 */

import type { Clock } from '../types';

// =============================================================================
// Leadership Session
// =============================================================================

/**
 * An active leadership session.
 * The holder MUST call release() when done processing.
 */
export interface LeadershipSession {
	/** Unique session identifier */
	readonly sessionId: string;

	/**
	 * Release leadership.
	 * For Web Locks: releases the lock
	 * For Lease: clears the lease row
	 */
	release(): Promise<void>;

	/**
	 * Extend the leadership session (lease fallback only).
	 * For Web Locks: no-op (lock is held until release)
	 * For Lease: updates expiresAt to now + LEASE_MS
	 */
	renew(): Promise<void>;
}

// =============================================================================
// Leadership Provider
// =============================================================================

/**
 * Leadership provider interface.
 */
export interface LeadershipProvider {
	/**
	 * Attempt to acquire leadership.
	 *
	 * @returns Session if acquired, null if another tab is leader
	 */
	tryAcquire(): Promise<LeadershipSession | null>;

	/**
	 * Check if this provider type is available.
	 */
	isAvailable(): boolean;

	/**
	 * Provider type identifier.
	 */
	readonly type: 'web-locks' | 'lease';
}

// =============================================================================
// Dependencies
// =============================================================================

/**
 * Dependencies for leadership providers.
 */
export interface LeadershipDeps {
	/** Clock for time operations */
	clock: Clock;
	/** Unique identifier for this tab/window */
	tabId: string;
	/** User scope for database isolation */
	userScope: string;
}

// =============================================================================
// Lease Store (for IDB fallback)
// =============================================================================

/**
 * Lease record stored in IndexedDB.
 */
export interface LeaseRecord {
	/** Fixed key - always 'lease' */
	key: 'lease';
	/** Tab ID holding the lease */
	holderId: string;
	/** Timestamp when lease expires (ms since epoch) */
	expiresAt: number;
}

/**
 * Lease store interface for IndexedDB persistence.
 */
export interface LeaseStore {
	/**
	 * Get the current lease record.
	 */
	get(): Promise<LeaseRecord | undefined>;

	/**
	 * Try to acquire or renew the lease.
	 * Succeeds if: no lease exists, lease expired, or we already hold it.
	 *
	 * @returns true if lease was acquired/renewed
	 */
	tryAcquire(holderId: string, expiresAt: number): Promise<boolean>;

	/**
	 * Release the lease (only if we hold it).
	 */
	release(holderId: string): Promise<void>;
}

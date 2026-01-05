/**
 * Outbox configuration constants.
 *
 * These are the default values from ADR 0018.
 * All timing values are in milliseconds.
 */

// =============================================================================
// Undo Grace Window
// =============================================================================

/** Time in ms during which undo is allowed after enqueue (5 seconds) */
export const UNDO_GRACE_MS = 5_000;

// =============================================================================
// Leadership (for T7-T8: cross-tab coordination)
// =============================================================================

/** Lease duration in ms for IDB lease fallback (10 seconds) */
export const LEASE_MS = 10_000;

/** Heartbeat interval in ms for lease renewal (~ lease / 3) */
export const HEARTBEAT_MS = 3_000;

// =============================================================================
// Retry Backoff
// =============================================================================

/** Base delay in ms for exponential backoff (1 second) */
export const BACKOFF_BASE_MS = 1_000;

/** Maximum delay cap in ms for backoff (60 seconds) */
export const BACKOFF_CAP_MS = 60_000;

/** Jitter range in ms added to backoff (0..250ms) */
export const JITTER_RANGE_MS = 250;

// =============================================================================
// BroadcastChannel
// =============================================================================

/** BroadcastChannel name for cross-tab coordination */
export const BROADCAST_CHANNEL_NAME = 'outbox';

// =============================================================================
// IndexedDB
// =============================================================================

/** IndexedDB schema version (v2 adds leadership_lease store) */
export const IDB_VERSION = 2;

/** IndexedDB object store name for outbox items */
export const IDB_STORE_NAME = 'outbox_items';

/** IndexedDB object store name for leadership lease */
export const LEASE_STORE_NAME = 'leadership_lease';

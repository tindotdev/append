/**
 * Shared types for the outbox feature.
 */

import type { EnqueueResult, OutboxCounts, OutboxItem, OutboxStatus, UndoResult } from '@/lib/outbox';

/**
 * Outbox context value exposed to consumers.
 */
export interface OutboxContextValue {
	/** Enqueue a capture_terms command */
	enqueue: (options: { terms: string }) => Promise<EnqueueResult>;
	/** Attempt to undo an item (only works within grace window) */
	undo: (itemId: string) => Promise<UndoResult>;
	/** Current counts by status */
	counts: OutboxCounts;
	/** Whether the outbox system is ready */
	isReady: boolean;
	/** List items by status (for management UI) */
	listByStatus: (status: OutboxStatus) => Promise<OutboxItem[]>;
	/** Discard a failed item permanently */
	discardItem: (itemId: string) => Promise<void>;
}

// Re-export types consumers might need
export type { EnqueueResult, OutboxCounts, OutboxItem, OutboxStatus, UndoResult };

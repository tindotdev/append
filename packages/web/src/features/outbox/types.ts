/**
 * Shared types for the outbox feature.
 */

import type { EnqueueResult, UndoResult } from '@append/outbox';
import type { OutboxCommand, OutboxCounts, OutboxItem, OutboxStatus } from '@/lib/outbox-adapter';

/**
 * Outbox context value exposed to consumers.
 */
export interface OutboxContextValue {
	/** Enqueue a capture_terms command */
	enqueue: (options: { terms: string }) => Promise<EnqueueResult<OutboxCommand>>;
	/** Attempt to undo an item (only works within grace window) */
	undo: (itemId: string) => Promise<UndoResult<OutboxCommand>>;
	/** Current counts by status */
	counts: OutboxCounts;
	/** Whether the outbox system is ready */
	isReady: boolean;
	/** List items by status (for management UI) */
	listByStatus: (status: OutboxStatus) => Promise<OutboxItem<OutboxCommand>[]>;
	/** Discard a failed item permanently */
	discardItem: (itemId: string) => Promise<void>;
}

// Re-export types consumers might need
export type { OutboxCounts, OutboxStatus };
export type { EnqueueResult, UndoResult } from '@append/outbox';
export type { OutboxCommand } from '@/lib/outbox-adapter';

// App-specific OutboxItem bound to our command type
export type { OutboxItem };
export type AppOutboxItem = OutboxItem<OutboxCommand>;

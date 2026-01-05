/**
 * Outbox feature module.
 *
 * Provides React integration for the outbox system:
 * - OutboxProvider: App-level provider for outbox context
 * - useOutbox: Hook to access outbox operations and state
 * - SyncIndicator: Header component showing sync status
 * - OutboxManagement: UI for managing failed/blocked items
 */

// Components
export { OutboxManagement } from './components/OutboxManagement';
export { OutboxProvider } from './components/OutboxProvider';
export { SyncIndicator } from './components/SyncIndicator';

// Hooks
export { useOutbox, useOutboxCounts, useOutboxSafe } from './hooks/use-outbox';

// Types
export type {
	EnqueueResult,
	OutboxContextValue,
	OutboxCounts,
	OutboxItem,
	OutboxStatus,
	UndoResult,
} from './types';

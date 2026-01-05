/**
 * Hook to access the outbox context.
 */

import { createContext, useContext } from 'react';
import type { OutboxContextValue } from '../types';

/**
 * React context for the outbox system.
 * null when outside provider or before initialization.
 */
export const OutboxContext = createContext<OutboxContextValue | null>(null);

/**
 * Hook to access the outbox context.
 *
 * @throws {Error} If used outside of OutboxProvider or before initialization
 *
 * @example
 * ```tsx
 * function CaptureForm() {
 *   const { enqueue, undo, counts } = useOutbox();
 *
 *   const handleSubmit = async (terms: string) => {
 *     const { item } = await enqueue({ terms });
 *     // Show toast with undo action
 *   };
 * }
 * ```
 */
export function useOutbox(): OutboxContextValue {
	const context = useContext(OutboxContext);
	if (!context) {
		throw new Error('useOutbox must be used within an OutboxProvider');
	}
	return context;
}

/**
 * Hook to safely access the outbox context without throwing.
 * Returns null if outside OutboxProvider or before initialization completes.
 *
 * Use this when you need to conditionally access outbox functionality
 * and can handle the null case gracefully.
 *
 * @example
 * ```tsx
 * function SyncIndicator() {
 *   const outbox = useOutboxSafe();
 *   if (!outbox) return null; // Not ready yet
 *   return <Chip>{outbox.counts.pending} pending</Chip>;
 * }
 * ```
 */
export function useOutboxSafe(): OutboxContextValue | null {
	return useContext(OutboxContext);
}

// Default counts for when context is not ready
const DEFAULT_COUNTS = { pending: 0, failed: 0, blocked_auth: 0 };

/**
 * Hook to access outbox counts specifically.
 * Returns default zero counts when context is not ready.
 *
 * Safe to use during initialization - won't throw.
 */
export function useOutboxCounts() {
	const context = useContext(OutboxContext);
	if (!context) {
		return { counts: DEFAULT_COUNTS, isReady: false };
	}
	return { counts: context.counts, isReady: context.isReady };
}

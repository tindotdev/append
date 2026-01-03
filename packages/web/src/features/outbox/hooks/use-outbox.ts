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
 * @throws {Error} If used outside of OutboxProvider
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
 * Hook to access outbox counts specifically.
 * Convenience alias for components that only need counts.
 */
export function useOutboxCounts() {
	const { counts, isReady } = useOutbox();
	return { counts, isReady };
}

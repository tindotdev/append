/**
 * BroadcastChannel wrapper for cross-tab outbox coordination.
 *
 * Message types:
 * - `kick`: Wake the leader to check for due items
 * - `outbox_changed`: Notify all tabs to refresh counts/indicators
 * - `outbox_result`: Notify all tabs of a successful send (for "Batch ready" toast)
 */

import { BROADCAST_CHANNEL_NAME } from './constants';
import type { OutboxBroadcast, OutboxBroadcastMessage } from './types';

/**
 * Create a BroadcastChannel wrapper for cross-tab outbox coordination.
 *
 * Uses the real BroadcastChannel API for cross-tab messaging.
 */
export function createOutboxBroadcast(): OutboxBroadcast {
	// Create channel lazily to avoid errors in SSR/test environments
	let channel: BroadcastChannel | null = null;

	function getChannel(): BroadcastChannel {
		if (!channel) {
			channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
		}
		return channel;
	}

	const subscribers = new Set<(message: OutboxBroadcastMessage) => void>();

	return {
		publish(message: OutboxBroadcastMessage): void {
			// Broadcast to other tabs
			try {
				getChannel().postMessage(message);
			} catch {
				// Ignore errors (e.g., channel closed, serialization errors)
			}

			// Also notify local subscribers (BroadcastChannel doesn't echo to sender)
			for (const sub of subscribers) {
				try {
					sub(message);
				} catch {
					// Ignore handler errors
				}
			}
		},

		subscribe(handler: (message: OutboxBroadcastMessage) => void): () => void {
			const ch = getChannel();

			// If first subscriber, set up the listener
			if (subscribers.size === 0) {
				ch.onmessage = (event: MessageEvent<OutboxBroadcastMessage>) => {
					for (const sub of subscribers) {
						try {
							sub(event.data);
						} catch {
							// Ignore handler errors to prevent one bad handler from breaking others
						}
					}
				};
			}

			subscribers.add(handler);

			return () => {
				subscribers.delete(handler);
				if (subscribers.size === 0 && channel) {
					channel.onmessage = null;
				}
			};
		},
	};
}

/**
 * Create a mock broadcast for testing (in-memory, synchronous).
 *
 * The mock simulates cross-tab behavior by synchronously calling all subscribers
 * when a message is published.
 */
export function createMockBroadcast(): OutboxBroadcast & {
	/** All published messages (for test assertions) */
	messages: OutboxBroadcastMessage[];
	/** Clear all messages */
	clear(): void;
} {
	const messages: OutboxBroadcastMessage[] = [];
	const subscribers = new Set<(message: OutboxBroadcastMessage) => void>();

	return {
		messages,

		clear(): void {
			messages.length = 0;
		},

		publish(message: OutboxBroadcastMessage): void {
			messages.push(message);
			// Notify subscribers synchronously (simulates cross-tab)
			for (const sub of subscribers) {
				try {
					sub(message);
				} catch {
					// Ignore handler errors
				}
			}
		},

		subscribe(handler: (message: OutboxBroadcastMessage) => void): () => void {
			subscribers.add(handler);
			return () => subscribers.delete(handler);
		},
	};
}

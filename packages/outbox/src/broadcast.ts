/**
 * BroadcastChannel wrapper for cross-tab outbox coordination.
 *
 * Message types:
 * - `kick`: Wake the leader to check for due items
 * - `outbox_changed`: Notify all tabs to refresh counts/indicators
 * - `outbox_result`: Notify all tabs of a successful send (for app-specific handling)
 */

import { BROADCAST_CHANNEL_NAME } from './constants';
import type { OutboxBroadcast, OutboxBroadcastMessage } from './types';

/**
 * Create a BroadcastChannel wrapper for cross-tab outbox coordination.
 *
 * Uses the real BroadcastChannel API for cross-tab messaging.
 */
export function createOutboxBroadcast<TResult = unknown>(): OutboxBroadcast<TResult> {
	// Create channel lazily to avoid errors in SSR/test environments
	let channel: BroadcastChannel | null = null;

	// Stable per-instance sender ID (used to ignore BroadcastChannel self-echo)
	const senderId =
		typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
			? crypto.randomUUID()
			: `outbox-${Date.now()}-${Math.random().toString(16).slice(2)}`;

	function getChannel(): BroadcastChannel {
		if (!channel) {
			channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
		}
		return channel;
	}

	const subscribers = new Set<(message: OutboxBroadcastMessage<TResult>) => void>();

	type WireMessage = OutboxBroadcastMessage<TResult> & { __outbox_sender?: string };

	function notifySubscribers(message: OutboxBroadcastMessage<TResult>): void {
		for (const sub of subscribers) {
			try {
				sub(message);
			} catch {
				// Ignore handler errors
			}
		}
	}

	function dispatchWireMessage(wire: unknown): void {
		if (!wire || typeof wire !== 'object') return;

		const data = wire as WireMessage;
		if (data.__outbox_sender === senderId) return;

		// Strip internal metadata before delivering to app code.
		const message = { ...(data as WireMessage) };
		delete (message as Record<string, unknown>).__outbox_sender;
		notifySubscribers(message as OutboxBroadcastMessage<TResult>);
	}

	return {
		publish(message: OutboxBroadcastMessage<TResult>): void {
			// Broadcast to other tabs
			try {
				const wire: WireMessage = { ...message, __outbox_sender: senderId };
				getChannel().postMessage(wire);
			} catch {
				// Ignore errors (e.g., channel closed, serialization errors)
			}

			// Notify local subscribers immediately; ignore BroadcastChannel self-echo via senderId.
			notifySubscribers(message);
		},

		subscribe(handler: (message: OutboxBroadcastMessage<TResult>) => void): () => void {
			const ch = getChannel();

			// If first subscriber, set up the listener
			if (subscribers.size === 0) {
				ch.onmessage = (event: MessageEvent<unknown>) => {
					dispatchWireMessage(event.data);
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

		close(): void {
			// Clear all subscribers
			subscribers.clear();
			// Close the BroadcastChannel if it was created
			if (channel) {
				channel.onmessage = null;
				channel.close();
				channel = null;
			}
		},
	};
}

/**
 * Create a mock broadcast for testing (in-memory, synchronous).
 *
 * The mock simulates cross-tab behavior by synchronously calling all subscribers
 * when a message is published.
 */
export function createMockBroadcast<TResult = unknown>(): OutboxBroadcast<TResult> & {
	/** All published messages (for test assertions) */
	messages: OutboxBroadcastMessage<TResult>[];
	/** Clear all messages */
	clear(): void;
} {
	const messages: OutboxBroadcastMessage<TResult>[] = [];
	const subscribers = new Set<(message: OutboxBroadcastMessage<TResult>) => void>();

	return {
		messages,

		clear(): void {
			messages.length = 0;
		},

		publish(message: OutboxBroadcastMessage<TResult>): void {
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

		subscribe(handler: (message: OutboxBroadcastMessage<TResult>) => void): () => void {
			subscribers.add(handler);
			return () => subscribers.delete(handler);
		},

		close(): void {
			// Clear subscribers for mock
			subscribers.clear();
		},
	};
}

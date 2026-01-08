/**
 * Test setup for @append/outbox
 *
 * Provides browser API mocks for Node.js test environment.
 */

import 'fake-indexeddb/auto';

/**
 * Mock BroadcastChannel for tests.
 * Real BroadcastChannel is not available in Node.js.
 */
class MockBroadcastChannel {
	name: string;
	onmessage: ((event: MessageEvent) => void) | null = null;

	private static channels = new Map<string, Set<MockBroadcastChannel>>();

	constructor(name: string) {
		this.name = name;
		const channels = MockBroadcastChannel.channels.get(name) ?? new Set();
		channels.add(this);
		MockBroadcastChannel.channels.set(name, channels);
	}

	postMessage(data: unknown): void {
		const channels = MockBroadcastChannel.channels.get(this.name);
		if (!channels) return;

		for (const channel of channels) {
			if (channel !== this && channel.onmessage) {
				// Simulate async delivery like real BroadcastChannel
				setTimeout(() => {
					channel.onmessage?.(new MessageEvent('message', { data }));
				}, 0);
			}
		}
	}

	close(): void {
		const channels = MockBroadcastChannel.channels.get(this.name);
		if (channels) {
			channels.delete(this);
			if (channels.size === 0) {
				MockBroadcastChannel.channels.delete(this.name);
			}
		}
	}

	// Helper for tests to clear all channels
	static clearAll(): void {
		MockBroadcastChannel.channels.clear();
	}
}

// Install global mock
globalThis.BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel;

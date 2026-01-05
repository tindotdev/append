import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockBroadcast, createOutboxBroadcast } from '../broadcast';
import type { OutboxBroadcastMessage } from '../types';

describe('createMockBroadcast', () => {
	describe('publish', () => {
		it('adds message to messages array', () => {
			const broadcast = createMockBroadcast();

			broadcast.publish({ type: 'kick' });

			expect(broadcast.messages).toHaveLength(1);
			expect(broadcast.messages[0]).toEqual({ type: 'kick' });
		});

		it('preserves message order', () => {
			const broadcast = createMockBroadcast();

			broadcast.publish({ type: 'kick' });
			broadcast.publish({ type: 'outbox_changed', userScope: 'user-1' });
			broadcast.publish({
				type: 'outbox_result',
				userScope: 'user-1',
				result: { commandType: 'capture_terms', itemId: 'item-1', batchId: 'batch-1' },
			});

			expect(broadcast.messages).toHaveLength(3);
			expect(broadcast.messages[0]).toEqual({ type: 'kick' });
			expect(broadcast.messages[1]).toEqual({ type: 'outbox_changed', userScope: 'user-1' });
			expect(broadcast.messages[2]).toEqual({
				type: 'outbox_result',
				userScope: 'user-1',
				result: { commandType: 'capture_terms', itemId: 'item-1', batchId: 'batch-1' },
			});
		});

		it('notifies subscribers synchronously', () => {
			const broadcast = createMockBroadcast();
			const received: OutboxBroadcastMessage[] = [];

			broadcast.subscribe((msg) => received.push(msg));
			broadcast.publish({ type: 'kick' });

			expect(received).toHaveLength(1);
			expect(received[0]).toEqual({ type: 'kick' });
		});

		it('notifies multiple subscribers', () => {
			const broadcast = createMockBroadcast();
			const received1: OutboxBroadcastMessage[] = [];
			const received2: OutboxBroadcastMessage[] = [];

			broadcast.subscribe((msg) => received1.push(msg));
			broadcast.subscribe((msg) => received2.push(msg));
			broadcast.publish({ type: 'kick' });

			expect(received1).toHaveLength(1);
			expect(received2).toHaveLength(1);
		});

		it('ignores subscriber errors', () => {
			const broadcast = createMockBroadcast();
			const received: OutboxBroadcastMessage[] = [];

			broadcast.subscribe(() => {
				throw new Error('Handler error');
			});
			broadcast.subscribe((msg) => received.push(msg));

			// Should not throw
			expect(() => broadcast.publish({ type: 'kick' })).not.toThrow();

			// Second subscriber should still receive the message
			expect(received).toHaveLength(1);
		});
	});

	describe('subscribe', () => {
		it('returns unsubscribe function', () => {
			const broadcast = createMockBroadcast();
			const received: OutboxBroadcastMessage[] = [];

			const unsubscribe = broadcast.subscribe((msg) => received.push(msg));

			broadcast.publish({ type: 'kick' });
			expect(received).toHaveLength(1);

			unsubscribe();

			broadcast.publish({ type: 'kick' });
			expect(received).toHaveLength(1); // Should not receive new message
		});

		it('allows multiple unsubscribes without error', () => {
			const broadcast = createMockBroadcast();
			const unsubscribe = broadcast.subscribe(() => {});

			unsubscribe();
			expect(() => unsubscribe()).not.toThrow();
		});
	});

	describe('clear', () => {
		it('clears all messages', () => {
			const broadcast = createMockBroadcast();

			broadcast.publish({ type: 'kick' });
			broadcast.publish({ type: 'kick' });
			expect(broadcast.messages).toHaveLength(2);

			broadcast.clear();
			expect(broadcast.messages).toHaveLength(0);
		});
	});
});

describe('createOutboxBroadcast', () => {
	it('creates a broadcast instance', () => {
		const broadcast = createOutboxBroadcast();

		expect(broadcast).toHaveProperty('publish');
		expect(broadcast).toHaveProperty('subscribe');
		expect(typeof broadcast.publish).toBe('function');
		expect(typeof broadcast.subscribe).toBe('function');
	});

	it('publish does not throw', () => {
		const broadcast = createOutboxBroadcast();

		// Should not throw even with mock BroadcastChannel
		expect(() => broadcast.publish({ type: 'kick' })).not.toThrow();
	});

	it('subscribe returns unsubscribe function', () => {
		const broadcast = createOutboxBroadcast();
		const handler = vi.fn();

		const unsubscribe = broadcast.subscribe(handler);

		expect(typeof unsubscribe).toBe('function');
		expect(() => unsubscribe()).not.toThrow();
	});
});

describe('createOutboxBroadcast (BroadcastChannel echo)', () => {
	class MockBroadcastChannel {
		static channelsByName = new Map<string, Set<MockBroadcastChannel>>();

		name: string;
		onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

		constructor(name: string) {
			this.name = name;
			const set = MockBroadcastChannel.channelsByName.get(name) ?? new Set<MockBroadcastChannel>();
			set.add(this);
			MockBroadcastChannel.channelsByName.set(name, set);
		}

		postMessage(data: unknown) {
			const set = MockBroadcastChannel.channelsByName.get(this.name);
			if (!set) return;

			for (const ch of set) {
				ch.onmessage?.({ data } as MessageEvent<unknown>);
			}
		}

		close() {
			const set = MockBroadcastChannel.channelsByName.get(this.name);
			set?.delete(this);
			if (set && set.size === 0) {
				MockBroadcastChannel.channelsByName.delete(this.name);
			}
		}

		static reset() {
			MockBroadcastChannel.channelsByName.clear();
		}
	}

	afterEach(() => {
		MockBroadcastChannel.reset();
		vi.unstubAllGlobals();
	});

	it('does not double-dispatch to local subscribers', () => {
		vi.stubGlobal('BroadcastChannel', MockBroadcastChannel as unknown as typeof BroadcastChannel);

		const broadcast = createOutboxBroadcast();
		const handler = vi.fn();

		broadcast.subscribe(handler);
		broadcast.publish({ type: 'kick' });

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it('delivers to other instances in the same tab', () => {
		vi.stubGlobal('BroadcastChannel', MockBroadcastChannel as unknown as typeof BroadcastChannel);

		const a = createOutboxBroadcast();
		const b = createOutboxBroadcast();

		const handlerA = vi.fn();
		const handlerB = vi.fn();

		a.subscribe(handlerA);
		b.subscribe(handlerB);

		a.publish({ type: 'kick' });

		expect(handlerA).toHaveBeenCalledTimes(1);
		expect(handlerB).toHaveBeenCalledTimes(1);
	});
});

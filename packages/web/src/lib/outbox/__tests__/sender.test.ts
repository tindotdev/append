import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockBroadcast } from '../broadcast';
import { UNDO_GRACE_MS } from '../constants';
import { createEnqueueHelper, createSenderLoop, createUndoHelper } from '../sender';
import { createMockOutboxStore } from '../store';
import type { CaptureTermsCommand, Clock, CommandSender, OutboxItem, SendResult } from '../types';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockClock(initialTime = 1000): Clock & { advance: (ms: number) => void; set: (ms: number) => void } {
	let time = initialTime;
	return {
		now: () => time,
		advance: (ms: number) => {
			time += ms;
		},
		set: (ms: number) => {
			time = ms;
		},
	};
}

function createMockSender(defaultResult: SendResult = { outcome: 'success', batchId: 'batch-123' }): CommandSender & {
	setResult: (result: SendResult) => void;
	calls: Array<{ command: CaptureTermsCommand }>;
} {
	let result = defaultResult;
	const calls: Array<{ command: CaptureTermsCommand }> = [];
	return {
		calls,
		setResult: (r: SendResult) => {
			result = r;
		},
		send: async (command) => {
			calls.push({ command: command as CaptureTermsCommand });
			return result;
		},
	};
}

function createTestItem(overrides: Partial<OutboxItem<CaptureTermsCommand>> = {}): OutboxItem<CaptureTermsCommand> {
	const now = 1000;
	return {
		id: overrides.id ?? `item-${Math.random().toString(36).slice(2)}`,
		userScope: 'user-123',
		command: {
			type: 'capture_terms',
			request: {
				terms: 'test term',
				clientRequestId: 'req-123',
			},
		},
		createdAt: now,
		updatedAt: now,
		undoUntil: now + UNDO_GRACE_MS,
		status: 'pending',
		attemptCount: 0,
		nextAttemptAt: now, // Due immediately for testing
		...overrides,
	};
}

// =============================================================================
// Sender Loop Tests
// =============================================================================

describe('createSenderLoop', () => {
	let store: ReturnType<typeof createMockOutboxStore>;
	let broadcast: ReturnType<typeof createMockBroadcast>;
	let clock: ReturnType<typeof createMockClock>;
	let sender: ReturnType<typeof createMockSender>;
	const userScope = 'user-123';

	beforeEach(() => {
		store = createMockOutboxStore();
		broadcast = createMockBroadcast();
		clock = createMockClock(1000);
		sender = createMockSender();
	});

	describe('processOnce', () => {
		it('returns false when no items are due', async () => {
			const loop = createSenderLoop({ store, sender, broadcast, clock, userScope });

			const result = await loop.processOnce();

			expect(result).toBe(false);
			expect(sender.calls).toHaveLength(0);
		});

		it('processes due items and returns true', async () => {
			const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
			await store.put(item);

			const loop = createSenderLoop({ store, sender, broadcast, clock, userScope });
			const result = await loop.processOnce();

			expect(result).toBe(true);
			expect(sender.calls).toHaveLength(1);
		});

		it('skips items not yet due', async () => {
			const item = createTestItem({ id: 'item-1', nextAttemptAt: 2000 }); // Future
			await store.put(item);

			const loop = createSenderLoop({ store, sender, broadcast, clock, userScope });
			const result = await loop.processOnce();

			expect(result).toBe(false);
			expect(sender.calls).toHaveLength(0);
		});

		it('skips items with wrong userScope', async () => {
			const item = createTestItem({ id: 'item-1', userScope: 'other-user', nextAttemptAt: 500 });
			await store.put(item);

			const loop = createSenderLoop({ store, sender, broadcast, clock, userScope });
			const result = await loop.processOnce();

			expect(result).toBe(false);
		});

		describe('on success (201/200)', () => {
			it('deletes the item from store', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				sender.setResult({ outcome: 'success', batchId: 'batch-abc' });

				const loop = createSenderLoop({ store, sender, broadcast, clock, userScope });
				await loop.processOnce();

				expect(await store.get('item-1')).toBeUndefined();
			});

			it('broadcasts outbox_changed and outbox_result', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				sender.setResult({ outcome: 'success', batchId: 'batch-abc' });

				const loop = createSenderLoop({ store, sender, broadcast, clock, userScope });
				await loop.processOnce();

				expect(broadcast.messages).toContainEqual({ type: 'outbox_changed', userScope });
				expect(broadcast.messages).toContainEqual({
					type: 'outbox_result',
					userScope,
					result: {
						commandType: 'capture_terms',
						itemId: 'item-1',
						batchId: 'batch-abc',
					},
				});
			});
		});

		describe('on retry (network error, 429, 503)', () => {
			it('increments attemptCount', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500, attemptCount: 2 });
				await store.put(item);
				sender.setResult({ outcome: 'retry', error: { message: 'Server error' } });

				const loop = createSenderLoop({ store, sender, broadcast, clock, userScope });
				await loop.processOnce();

				const updated = await store.get('item-1');
				expect(updated?.attemptCount).toBe(3);
			});

			it('schedules next attempt with backoff', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500, attemptCount: 0 });
				await store.put(item);
				sender.setResult({ outcome: 'retry', error: { message: 'Server error' } });

				const loop = createSenderLoop({ store, sender, broadcast, clock, userScope });
				await loop.processOnce();

				const updated = await store.get('item-1');
				// After attempt 0, backoff is ~1000ms (base) + jitter
				expect(updated?.nextAttemptAt).toBeGreaterThan(clock.now());
			});

			it('stores lastError', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				sender.setResult({ outcome: 'retry', error: { status: 503, message: 'Service Unavailable' } });

				const loop = createSenderLoop({ store, sender, broadcast, clock, userScope });
				await loop.processOnce();

				const updated = await store.get('item-1');
				expect(updated?.lastError).toEqual({ status: 503, message: 'Service Unavailable' });
			});

			it('keeps status as pending', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				sender.setResult({ outcome: 'retry', error: { message: 'Error' } });

				const loop = createSenderLoop({ store, sender, broadcast, clock, userScope });
				await loop.processOnce();

				const updated = await store.get('item-1');
				expect(updated?.status).toBe('pending');
			});

			it('broadcasts outbox_changed', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				sender.setResult({ outcome: 'retry', error: { message: 'Error' } });

				const loop = createSenderLoop({ store, sender, broadcast, clock, userScope });
				await loop.processOnce();

				expect(broadcast.messages).toContainEqual({ type: 'outbox_changed', userScope });
			});
		});

		describe('on blocked_auth (401/403)', () => {
			it('marks item as blocked_auth', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				sender.setResult({ outcome: 'blocked_auth', error: { status: 401, message: 'Unauthorized' } });

				const loop = createSenderLoop({ store, sender, broadcast, clock, userScope });
				await loop.processOnce();

				const updated = await store.get('item-1');
				expect(updated?.status).toBe('blocked_auth');
			});

			it('calls onAuthBlocked callback', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				sender.setResult({ outcome: 'blocked_auth', error: { status: 401, message: 'Unauthorized' } });

				const onAuthBlocked = vi.fn();
				const loop = createSenderLoop({ store, sender, broadcast, clock, userScope, onAuthBlocked });
				await loop.processOnce();

				expect(onAuthBlocked).toHaveBeenCalledTimes(1);
			});

			it('stops processing after blocked_auth', async () => {
				const item1 = createTestItem({ id: 'item-1', nextAttemptAt: 400 });
				const item2 = createTestItem({ id: 'item-2', nextAttemptAt: 500 });
				await store.put(item1);
				await store.put(item2);

				let callCount = 0;
				sender.send = async () => {
					callCount++;
					return { outcome: 'blocked_auth', error: { status: 401, message: 'Unauthorized' } };
				};

				const loop = createSenderLoop({ store, sender, broadcast, clock, userScope });
				await loop.processOnce();

				// Should only process one item before stopping
				expect(callCount).toBe(1);
			});
		});

		describe('on failed (400 VALIDATION_ERROR, 409, 413)', () => {
			it('marks item as failed', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				sender.setResult({ outcome: 'failed', error: { status: 400, code: 'VALIDATION_ERROR', message: 'Invalid' } });

				const loop = createSenderLoop({ store, sender, broadcast, clock, userScope });
				await loop.processOnce();

				const updated = await store.get('item-1');
				expect(updated?.status).toBe('failed');
			});

			it('stores lastError', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				sender.setResult({
					outcome: 'failed',
					error: { status: 409, code: 'IDEMPOTENCY_CONFLICT', message: 'Conflict' },
				});

				const loop = createSenderLoop({ store, sender, broadcast, clock, userScope });
				await loop.processOnce();

				const updated = await store.get('item-1');
				expect(updated?.lastError).toEqual({
					status: 409,
					code: 'IDEMPOTENCY_CONFLICT',
					message: 'Conflict',
				});
			});

			it('broadcasts outbox_changed', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				sender.setResult({ outcome: 'failed', error: { message: 'Error' } });

				const loop = createSenderLoop({ store, sender, broadcast, clock, userScope });
				await loop.processOnce();

				expect(broadcast.messages).toContainEqual({ type: 'outbox_changed', userScope });
			});
		});

		it('processes multiple items in FIFO order', async () => {
			const item1 = createTestItem({ id: 'item-1', nextAttemptAt: 300 });
			const item2 = createTestItem({ id: 'item-2', nextAttemptAt: 400 });
			const item3 = createTestItem({ id: 'item-3', nextAttemptAt: 500 });
			await store.put(item2);
			await store.put(item3);
			await store.put(item1);

			const loop = createSenderLoop({ store, sender, broadcast, clock, userScope });
			await loop.processOnce();

			// All three should be processed in order
			expect(sender.calls).toHaveLength(3);
			expect(sender.calls[0].command.request.clientRequestId).toBe(item1.command.request.clientRequestId);
			expect(sender.calls[1].command.request.clientRequestId).toBe(item2.command.request.clientRequestId);
			expect(sender.calls[2].command.request.clientRequestId).toBe(item3.command.request.clientRequestId);
		});
	});

	describe('getNextDueTime', () => {
		it('returns null when no pending items', async () => {
			const loop = createSenderLoop({ store, sender, broadcast, clock, userScope });

			const result = await loop.getNextDueTime();

			expect(result).toBeNull();
		});

		it('returns earliest nextAttemptAt', async () => {
			await store.put(createTestItem({ id: 'item-1', nextAttemptAt: 3000 }));
			await store.put(createTestItem({ id: 'item-2', nextAttemptAt: 1500 }));
			await store.put(createTestItem({ id: 'item-3', nextAttemptAt: 2000 }));

			const loop = createSenderLoop({ store, sender, broadcast, clock, userScope });
			const result = await loop.getNextDueTime();

			expect(result).toBe(1500);
		});

		it('excludes non-pending items', async () => {
			await store.put(createTestItem({ id: 'item-1', status: 'failed', nextAttemptAt: 1000 }));
			await store.put(createTestItem({ id: 'item-2', status: 'pending', nextAttemptAt: 2000 }));

			const loop = createSenderLoop({ store, sender, broadcast, clock, userScope });
			const result = await loop.getNextDueTime();

			expect(result).toBe(2000);
		});
	});
});

// =============================================================================
// Enqueue Helper Tests
// =============================================================================

describe('createEnqueueHelper', () => {
	let store: ReturnType<typeof createMockOutboxStore>;
	let broadcast: ReturnType<typeof createMockBroadcast>;
	let clock: ReturnType<typeof createMockClock>;
	const userScope = 'user-123';

	beforeEach(() => {
		store = createMockOutboxStore();
		broadcast = createMockBroadcast();
		clock = createMockClock(1000);
	});

	it('creates an item with correct properties', async () => {
		const enqueue = createEnqueueHelper({ store, broadcast, clock, userScope });

		const { item } = await enqueue({ terms: 'term1\nterm2' });

		expect(item.id).toBeDefined();
		expect(item.userScope).toBe(userScope);
		expect(item.command.type).toBe('capture_terms');
		expect(item.command.request.terms).toBe('term1\nterm2');
		expect(item.command.request.clientRequestId).toBeDefined();
		expect(item.status).toBe('pending');
		expect(item.attemptCount).toBe(0);
	});

	it('sets undoUntil = now + UNDO_GRACE_MS', async () => {
		const enqueue = createEnqueueHelper({ store, broadcast, clock, userScope });

		const { item } = await enqueue({ terms: 'test' });

		expect(item.undoUntil).toBe(clock.now() + UNDO_GRACE_MS);
	});

	it('sets nextAttemptAt = undoUntil (prevents send during grace window)', async () => {
		const enqueue = createEnqueueHelper({ store, broadcast, clock, userScope });

		const { item } = await enqueue({ terms: 'test' });

		expect(item.nextAttemptAt).toBe(item.undoUntil);
	});

	it('persists item to store', async () => {
		const enqueue = createEnqueueHelper({ store, broadcast, clock, userScope });

		const { item } = await enqueue({ terms: 'test' });

		const stored = await store.get(item.id);
		expect(stored).toBeDefined();
		expect(stored?.command.request.terms).toBe('test');
	});

	it('broadcasts outbox_changed and kick', async () => {
		const enqueue = createEnqueueHelper({ store, broadcast, clock, userScope });

		await enqueue({ terms: 'test' });

		expect(broadcast.messages).toContainEqual({ type: 'outbox_changed', userScope });
		expect(broadcast.messages).toContainEqual({ type: 'kick' });
	});

	it('generates unique IDs for each enqueue', async () => {
		const enqueue = createEnqueueHelper({ store, broadcast, clock, userScope });

		const { item: item1 } = await enqueue({ terms: 'test1' });
		const { item: item2 } = await enqueue({ terms: 'test2' });

		expect(item1.id).not.toBe(item2.id);
		expect(item1.command.request.clientRequestId).not.toBe(item2.command.request.clientRequestId);
	});
});

// =============================================================================
// Undo Helper Tests
// =============================================================================

describe('createUndoHelper', () => {
	let store: ReturnType<typeof createMockOutboxStore>;
	let broadcast: ReturnType<typeof createMockBroadcast>;
	let clock: ReturnType<typeof createMockClock>;
	const userScope = 'user-123';

	beforeEach(() => {
		store = createMockOutboxStore();
		broadcast = createMockBroadcast();
		clock = createMockClock(1000);
	});

	it('returns success and terms when within grace window', async () => {
		const item = createTestItem({
			id: 'item-1',
			undoUntil: clock.now() + 5000, // 5 seconds from now
			command: { type: 'capture_terms', request: { terms: 'my terms', clientRequestId: 'req-1' } },
		});
		await store.put(item);

		const undo = createUndoHelper({ store, broadcast, clock, userScope });
		const result = await undo('item-1');

		expect(result.success).toBe(true);
		expect(result.terms).toBe('my terms');
	});

	it('deletes item from store on successful undo', async () => {
		const item = createTestItem({ id: 'item-1', undoUntil: clock.now() + 5000 });
		await store.put(item);

		const undo = createUndoHelper({ store, broadcast, clock, userScope });
		await undo('item-1');

		expect(await store.get('item-1')).toBeUndefined();
	});

	it('broadcasts outbox_changed on successful undo', async () => {
		const item = createTestItem({ id: 'item-1', undoUntil: clock.now() + 5000 });
		await store.put(item);

		const undo = createUndoHelper({ store, broadcast, clock, userScope });
		await undo('item-1');

		expect(broadcast.messages).toContainEqual({ type: 'outbox_changed', userScope });
	});

	it('returns failure when undo window has expired', async () => {
		const item = createTestItem({
			id: 'item-1',
			undoUntil: clock.now() - 1, // Already expired
		});
		await store.put(item);

		const undo = createUndoHelper({ store, broadcast, clock, userScope });
		const result = await undo('item-1');

		expect(result.success).toBe(false);
		expect(result.terms).toBeUndefined();
	});

	it('does not delete item when undo window has expired', async () => {
		const item = createTestItem({ id: 'item-1', undoUntil: clock.now() - 1 });
		await store.put(item);

		const undo = createUndoHelper({ store, broadcast, clock, userScope });
		await undo('item-1');

		expect(await store.get('item-1')).toBeDefined();
	});

	it('returns failure for non-existent item', async () => {
		const undo = createUndoHelper({ store, broadcast, clock, userScope });
		const result = await undo('non-existent');

		expect(result.success).toBe(false);
	});

	it('returns failure for wrong userScope', async () => {
		const item = createTestItem({
			id: 'item-1',
			userScope: 'other-user',
			undoUntil: clock.now() + 5000,
		});
		await store.put(item);

		const undo = createUndoHelper({ store, broadcast, clock, userScope });
		const result = await undo('item-1');

		expect(result.success).toBe(false);
	});

	it('returns failure exactly at undoUntil boundary', async () => {
		const item = createTestItem({
			id: 'item-1',
			undoUntil: clock.now(), // Exactly at boundary
		});
		await store.put(item);

		const undo = createUndoHelper({ store, broadcast, clock, userScope });
		const result = await undo('item-1');

		// At exactly undoUntil, undo should fail (now >= undoUntil)
		expect(result.success).toBe(false);
	});
});

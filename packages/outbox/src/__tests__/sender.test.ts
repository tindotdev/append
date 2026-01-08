import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockBroadcast } from '../broadcast';
import { UNDO_GRACE_MS } from '../constants';
import { createEnqueueHelper, createSenderLoop, createUndoHelper } from '../sender';
import { createMockOutboxStore } from '../store';
import type { Transport, TransportResult } from '../transport';
import type { Clock, OutboxItem } from '../types';

// =============================================================================
// Test Types
// =============================================================================

interface TestCommand {
	type: 'test_command';
	request: {
		data: string;
		clientRequestId: string;
	};
}

interface TestResult {
	resultId: string;
}

interface TestBroadcastResult {
	commandType: string;
	itemId: string;
	resultId: string;
}

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

function createMockTransport(
	defaultResult: TransportResult<TestResult> = { outcome: 'success', result: { resultId: 'result-123' } }
): Transport<TestCommand, TestResult> & {
	setResult: (result: TransportResult<TestResult>) => void;
	calls: Array<{ command: TestCommand }>;
} {
	let result = defaultResult;
	const calls: Array<{ command: TestCommand }> = [];
	return {
		calls,
		setResult: (r: TransportResult<TestResult>) => {
			result = r;
		},
		execute: async (command) => {
			calls.push({ command });
			return result;
		},
	};
}

function createTestItem(overrides: Partial<OutboxItem<TestCommand>> = {}): OutboxItem<TestCommand> {
	const now = 1000;
	return {
		id: overrides.id ?? `item-${Math.random().toString(36).slice(2)}`,
		userScope: 'user-123',
		command: {
			type: 'test_command',
			request: {
				data: 'test data',
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

function createResultPayload(item: OutboxItem<TestCommand>, result: TestResult): TestBroadcastResult {
	return {
		commandType: item.command.type,
		itemId: item.id,
		resultId: result.resultId,
	};
}

// =============================================================================
// Sender Loop Tests
// =============================================================================

describe('createSenderLoop', () => {
	let store: ReturnType<typeof createMockOutboxStore<TestCommand>>;
	let broadcast: ReturnType<typeof createMockBroadcast<TestBroadcastResult>>;
	let clock: ReturnType<typeof createMockClock>;
	let transport: ReturnType<typeof createMockTransport>;
	const userScope = 'user-123';

	beforeEach(() => {
		store = createMockOutboxStore<TestCommand>();
		broadcast = createMockBroadcast<TestBroadcastResult>();
		clock = createMockClock(1000);
		transport = createMockTransport();
	});

	describe('processOnce', () => {
		it('returns false when no items are due', async () => {
			const loop = createSenderLoop({ store, transport, broadcast, clock, userScope, createResultPayload });

			const result = await loop.processOnce();

			expect(result).toBe(false);
			expect(transport.calls).toHaveLength(0);
		});

		it('processes due items and returns true', async () => {
			const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
			await store.put(item);

			const loop = createSenderLoop({ store, transport, broadcast, clock, userScope, createResultPayload });
			const result = await loop.processOnce();

			expect(result).toBe(true);
			expect(transport.calls).toHaveLength(1);
		});

		it('skips items not yet due', async () => {
			const item = createTestItem({ id: 'item-1', nextAttemptAt: 2000 }); // Future
			await store.put(item);

			const loop = createSenderLoop({ store, transport, broadcast, clock, userScope, createResultPayload });
			const result = await loop.processOnce();

			expect(result).toBe(false);
			expect(transport.calls).toHaveLength(0);
		});

		it('skips items with wrong userScope', async () => {
			const item = createTestItem({ id: 'item-1', userScope: 'other-user', nextAttemptAt: 500 });
			await store.put(item);

			const loop = createSenderLoop({ store, transport, broadcast, clock, userScope, createResultPayload });
			const result = await loop.processOnce();

			expect(result).toBe(false);
		});

		describe('on success', () => {
			it('deletes the item from store', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				transport.setResult({ outcome: 'success', result: { resultId: 'result-abc' } });

				const loop = createSenderLoop({ store, transport, broadcast, clock, userScope, createResultPayload });
				await loop.processOnce();

				expect(await store.get('item-1')).toBeUndefined();
			});

			it('broadcasts outbox_changed and outbox_result', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				transport.setResult({ outcome: 'success', result: { resultId: 'result-abc' } });

				const loop = createSenderLoop({ store, transport, broadcast, clock, userScope, createResultPayload });
				await loop.processOnce();

				expect(broadcast.messages).toContainEqual({ type: 'outbox_changed', userScope });
				expect(broadcast.messages).toContainEqual({
					type: 'outbox_result',
					userScope,
					result: {
						commandType: 'test_command',
						itemId: 'item-1',
						resultId: 'result-abc',
					},
				});
			});
		});

		describe('on retry (network error, 429, 503)', () => {
			it('increments attemptCount', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500, attemptCount: 2 });
				await store.put(item);
				transport.setResult({ outcome: 'retry', error: { message: 'Server error' } });

				const loop = createSenderLoop({ store, transport, broadcast, clock, userScope, createResultPayload });
				await loop.processOnce();

				const updated = await store.get('item-1');
				expect(updated?.attemptCount).toBe(3);
			});

			it('schedules next attempt with backoff', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500, attemptCount: 0 });
				await store.put(item);
				transport.setResult({ outcome: 'retry', error: { message: 'Server error' } });

				const loop = createSenderLoop({ store, transport, broadcast, clock, userScope, createResultPayload });
				await loop.processOnce();

				const updated = await store.get('item-1');
				// After attempt 0, backoff is ~1000ms (base) + jitter
				expect(updated?.nextAttemptAt).toBeGreaterThan(clock.now());
			});

			it('stores lastError', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				transport.setResult({ outcome: 'retry', error: { status: 503, message: 'Service Unavailable' } });

				const loop = createSenderLoop({ store, transport, broadcast, clock, userScope, createResultPayload });
				await loop.processOnce();

				const updated = await store.get('item-1');
				expect(updated?.lastError).toEqual({ status: 503, message: 'Service Unavailable' });
			});

			it('keeps status as pending', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				transport.setResult({ outcome: 'retry', error: { message: 'Error' } });

				const loop = createSenderLoop({ store, transport, broadcast, clock, userScope, createResultPayload });
				await loop.processOnce();

				const updated = await store.get('item-1');
				expect(updated?.status).toBe('pending');
			});

			it('broadcasts outbox_changed', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				transport.setResult({ outcome: 'retry', error: { message: 'Error' } });

				const loop = createSenderLoop({ store, transport, broadcast, clock, userScope, createResultPayload });
				await loop.processOnce();

				expect(broadcast.messages).toContainEqual({ type: 'outbox_changed', userScope });
			});
		});

		describe('on blocked_auth (401/403)', () => {
			it('marks item as blocked_auth', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				transport.setResult({ outcome: 'blocked_auth', error: { status: 401, message: 'Unauthorized' } });

				const loop = createSenderLoop({ store, transport, broadcast, clock, userScope, createResultPayload });
				await loop.processOnce();

				const updated = await store.get('item-1');
				expect(updated?.status).toBe('blocked_auth');
			});

			it('calls onAuthBlocked callback', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				transport.setResult({ outcome: 'blocked_auth', error: { status: 401, message: 'Unauthorized' } });

				const onAuthBlocked = vi.fn();
				const loop = createSenderLoop({ store, transport, broadcast, clock, userScope, onAuthBlocked, createResultPayload });
				await loop.processOnce();

				expect(onAuthBlocked).toHaveBeenCalledTimes(1);
			});

			it('stops processing after blocked_auth', async () => {
				const item1 = createTestItem({ id: 'item-1', nextAttemptAt: 400 });
				const item2 = createTestItem({ id: 'item-2', nextAttemptAt: 500 });
				await store.put(item1);
				await store.put(item2);

				let callCount = 0;
				transport.execute = async () => {
					callCount++;
					return { outcome: 'blocked_auth', error: { status: 401, message: 'Unauthorized' } };
				};

				const loop = createSenderLoop({ store, transport, broadcast, clock, userScope, createResultPayload });
				await loop.processOnce();

				// Should only process one item before stopping
				expect(callCount).toBe(1);
			});
		});

		describe('on failed (400 VALIDATION_ERROR, 409, 413)', () => {
			it('marks item as failed', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				transport.setResult({ outcome: 'failed', error: { status: 400, code: 'VALIDATION_ERROR', message: 'Invalid' } });

				const loop = createSenderLoop({ store, transport, broadcast, clock, userScope, createResultPayload });
				await loop.processOnce();

				const updated = await store.get('item-1');
				expect(updated?.status).toBe('failed');
			});

			it('stores lastError', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				transport.setResult({
					outcome: 'failed',
					error: { status: 409, code: 'IDEMPOTENCY_CONFLICT', message: 'Conflict' },
				});

				const loop = createSenderLoop({ store, transport, broadcast, clock, userScope, createResultPayload });
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
				transport.setResult({ outcome: 'failed', error: { message: 'Error' } });

				const loop = createSenderLoop({ store, transport, broadcast, clock, userScope, createResultPayload });
				await loop.processOnce();

				expect(broadcast.messages).toContainEqual({ type: 'outbox_changed', userScope });
			});
		});

		describe('maxAttempts', () => {
			it('marks item as failed when max attempts exceeded', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500, attemptCount: 2 });
				await store.put(item);
				transport.setResult({ outcome: 'retry', error: { message: 'Server error' } });

				const loop = createSenderLoop({
					store,
					transport,
					broadcast,
					clock,
					userScope,
					createResultPayload,
					maxAttempts: 3, // Item has 2 attempts, next would be 3rd
				});
				await loop.processOnce();

				const updated = await store.get('item-1');
				expect(updated?.status).toBe('failed');
				expect(updated?.lastError?.message).toBe('Max attempts (3) exceeded');
				expect(updated?.attemptCount).toBe(3);
			});

			it('allows retries when under max attempts', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500, attemptCount: 1 });
				await store.put(item);
				transport.setResult({ outcome: 'retry', error: { message: 'Server error' } });

				const loop = createSenderLoop({
					store,
					transport,
					broadcast,
					clock,
					userScope,
					createResultPayload,
					maxAttempts: 3,
				});
				await loop.processOnce();

				const updated = await store.get('item-1');
				expect(updated?.status).toBe('pending');
				expect(updated?.attemptCount).toBe(2);
			});

			it('retries indefinitely when maxAttempts is undefined', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500, attemptCount: 100 });
				await store.put(item);
				transport.setResult({ outcome: 'retry', error: { message: 'Server error' } });

				const loop = createSenderLoop({
					store,
					transport,
					broadcast,
					clock,
					userScope,
					createResultPayload,
					// No maxAttempts set
				});
				await loop.processOnce();

				const updated = await store.get('item-1');
				expect(updated?.status).toBe('pending');
				expect(updated?.attemptCount).toBe(101);
			});
		});

		describe('observability callbacks', () => {
			it('calls onItemProcessed on success', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				transport.setResult({ outcome: 'success', result: { resultId: 'result-123' } });

				const onItemProcessed = vi.fn();
				const loop = createSenderLoop({
					store,
					transport,
					broadcast,
					clock,
					userScope,
					createResultPayload,
					onItemProcessed,
				});
				await loop.processOnce();

				expect(onItemProcessed).toHaveBeenCalledWith(expect.objectContaining({ id: 'item-1' }), 'success');
			});

			it('calls onItemProcessed on retry', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				transport.setResult({ outcome: 'retry', error: { message: 'Error' } });

				const onItemProcessed = vi.fn();
				const loop = createSenderLoop({
					store,
					transport,
					broadcast,
					clock,
					userScope,
					createResultPayload,
					onItemProcessed,
				});
				await loop.processOnce();

				expect(onItemProcessed).toHaveBeenCalledWith(expect.objectContaining({ id: 'item-1' }), 'retry');
			});

			it('calls onItemProcessed on blocked_auth', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				transport.setResult({ outcome: 'blocked_auth', error: { message: 'Unauthorized' } });

				const onItemProcessed = vi.fn();
				const loop = createSenderLoop({
					store,
					transport,
					broadcast,
					clock,
					userScope,
					createResultPayload,
					onItemProcessed,
				});
				await loop.processOnce();

				expect(onItemProcessed).toHaveBeenCalledWith(expect.objectContaining({ id: 'item-1' }), 'blocked_auth');
			});

			it('calls onItemProcessed on failed', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				transport.setResult({ outcome: 'failed', error: { message: 'Validation error' } });

				const onItemProcessed = vi.fn();
				const loop = createSenderLoop({
					store,
					transport,
					broadcast,
					clock,
					userScope,
					createResultPayload,
					onItemProcessed,
				});
				await loop.processOnce();

				expect(onItemProcessed).toHaveBeenCalledWith(expect.objectContaining({ id: 'item-1' }), 'failed');
			});

			it('calls onRetryScheduled with delay when retry is scheduled', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500, attemptCount: 0 });
				await store.put(item);
				transport.setResult({ outcome: 'retry', error: { message: 'Error' } });

				const onRetryScheduled = vi.fn();
				const loop = createSenderLoop({
					store,
					transport,
					broadcast,
					clock,
					userScope,
					createResultPayload,
					onRetryScheduled,
				});
				await loop.processOnce();

				expect(onRetryScheduled).toHaveBeenCalledWith(expect.objectContaining({ id: 'item-1', attemptCount: 1 }), expect.any(Number));
				// Delay should be positive
				const delayMs = onRetryScheduled.mock.calls[0][1];
				expect(delayMs).toBeGreaterThan(0);
			});

			it('does not call onRetryScheduled on success', async () => {
				const item = createTestItem({ id: 'item-1', nextAttemptAt: 500 });
				await store.put(item);
				transport.setResult({ outcome: 'success', result: { resultId: 'result-123' } });

				const onRetryScheduled = vi.fn();
				const loop = createSenderLoop({
					store,
					transport,
					broadcast,
					clock,
					userScope,
					createResultPayload,
					onRetryScheduled,
				});
				await loop.processOnce();

				expect(onRetryScheduled).not.toHaveBeenCalled();
			});
		});

		it('processes multiple items in FIFO order', async () => {
			const item1 = createTestItem({
				id: 'item-1',
				nextAttemptAt: 300,
				command: { type: 'test_command', request: { data: 'data1', clientRequestId: 'req-1' } },
			});
			const item2 = createTestItem({
				id: 'item-2',
				nextAttemptAt: 400,
				command: { type: 'test_command', request: { data: 'data2', clientRequestId: 'req-2' } },
			});
			const item3 = createTestItem({
				id: 'item-3',
				nextAttemptAt: 500,
				command: { type: 'test_command', request: { data: 'data3', clientRequestId: 'req-3' } },
			});
			await store.put(item2);
			await store.put(item3);
			await store.put(item1);

			const loop = createSenderLoop({ store, transport, broadcast, clock, userScope, createResultPayload });
			await loop.processOnce();

			// All three should be processed in order
			expect(transport.calls).toHaveLength(3);
			expect(transport.calls[0].command.request.clientRequestId).toBe('req-1');
			expect(transport.calls[1].command.request.clientRequestId).toBe('req-2');
			expect(transport.calls[2].command.request.clientRequestId).toBe('req-3');
		});
	});

	describe('getNextDueTime', () => {
		it('returns null when no pending items', async () => {
			const loop = createSenderLoop({ store, transport, broadcast, clock, userScope, createResultPayload });

			const result = await loop.getNextDueTime();

			expect(result).toBeNull();
		});

		it('returns earliest nextAttemptAt', async () => {
			await store.put(createTestItem({ id: 'item-1', nextAttemptAt: 3000 }));
			await store.put(createTestItem({ id: 'item-2', nextAttemptAt: 1500 }));
			await store.put(createTestItem({ id: 'item-3', nextAttemptAt: 2000 }));

			const loop = createSenderLoop({ store, transport, broadcast, clock, userScope, createResultPayload });
			const result = await loop.getNextDueTime();

			expect(result).toBe(1500);
		});

		it('excludes non-pending items', async () => {
			await store.put(createTestItem({ id: 'item-1', status: 'failed', nextAttemptAt: 1000 }));
			await store.put(createTestItem({ id: 'item-2', status: 'pending', nextAttemptAt: 2000 }));

			const loop = createSenderLoop({ store, transport, broadcast, clock, userScope, createResultPayload });
			const result = await loop.getNextDueTime();

			expect(result).toBe(2000);
		});
	});
});

// =============================================================================
// Enqueue Helper Tests
// =============================================================================

interface EnqueueOptions {
	data: string;
}

function createCommand(options: EnqueueOptions): TestCommand {
	return {
		type: 'test_command',
		request: {
			data: options.data,
			clientRequestId: crypto.randomUUID(),
		},
	};
}

describe('createEnqueueHelper', () => {
	let store: ReturnType<typeof createMockOutboxStore<TestCommand>>;
	let broadcast: ReturnType<typeof createMockBroadcast>;
	let clock: ReturnType<typeof createMockClock>;
	const userScope = 'user-123';

	beforeEach(() => {
		store = createMockOutboxStore<TestCommand>();
		broadcast = createMockBroadcast();
		clock = createMockClock(1000);
	});

	it('creates an item with correct properties', async () => {
		const enqueue = createEnqueueHelper<TestCommand, EnqueueOptions>({ store, broadcast, clock, userScope }, createCommand);

		const { item } = await enqueue({ data: 'test data' });

		expect(item.id).toBeDefined();
		expect(item.userScope).toBe(userScope);
		expect(item.command.type).toBe('test_command');
		expect(item.command.request.data).toBe('test data');
		expect(item.command.request.clientRequestId).toBeDefined();
		expect(item.status).toBe('pending');
		expect(item.attemptCount).toBe(0);
	});

	it('sets undoUntil = now + UNDO_GRACE_MS', async () => {
		const enqueue = createEnqueueHelper<TestCommand, EnqueueOptions>({ store, broadcast, clock, userScope }, createCommand);

		const { item } = await enqueue({ data: 'test' });

		expect(item.undoUntil).toBe(clock.now() + UNDO_GRACE_MS);
	});

	it('sets nextAttemptAt = undoUntil (prevents send during grace window)', async () => {
		const enqueue = createEnqueueHelper<TestCommand, EnqueueOptions>({ store, broadcast, clock, userScope }, createCommand);

		const { item } = await enqueue({ data: 'test' });

		expect(item.nextAttemptAt).toBe(item.undoUntil);
	});

	it('persists item to store', async () => {
		const enqueue = createEnqueueHelper<TestCommand, EnqueueOptions>({ store, broadcast, clock, userScope }, createCommand);

		const { item } = await enqueue({ data: 'test' });

		const stored = await store.get(item.id);
		expect(stored).toBeDefined();
		expect(stored?.command.request.data).toBe('test');
	});

	it('broadcasts outbox_changed and kick', async () => {
		const enqueue = createEnqueueHelper<TestCommand, EnqueueOptions>({ store, broadcast, clock, userScope }, createCommand);

		await enqueue({ data: 'test' });

		expect(broadcast.messages).toContainEqual({ type: 'outbox_changed', userScope });
		expect(broadcast.messages).toContainEqual({ type: 'kick' });
	});

	it('generates unique IDs for each enqueue', async () => {
		const enqueue = createEnqueueHelper<TestCommand, EnqueueOptions>({ store, broadcast, clock, userScope }, createCommand);

		const { item: item1 } = await enqueue({ data: 'test1' });
		const { item: item2 } = await enqueue({ data: 'test2' });

		expect(item1.id).not.toBe(item2.id);
		expect(item1.command.request.clientRequestId).not.toBe(item2.command.request.clientRequestId);
	});
});

// =============================================================================
// Undo Helper Tests
// =============================================================================

describe('createUndoHelper', () => {
	let store: ReturnType<typeof createMockOutboxStore<TestCommand>>;
	let broadcast: ReturnType<typeof createMockBroadcast>;
	let clock: ReturnType<typeof createMockClock>;
	const userScope = 'user-123';

	beforeEach(() => {
		store = createMockOutboxStore<TestCommand>();
		broadcast = createMockBroadcast();
		clock = createMockClock(1000);
	});

	it('returns success and command when within grace window', async () => {
		const command: TestCommand = { type: 'test_command', request: { data: 'my data', clientRequestId: 'req-1' } };
		const item = createTestItem({
			id: 'item-1',
			undoUntil: clock.now() + 5000, // 5 seconds from now
			command,
		});
		await store.put(item);

		const undo = createUndoHelper<TestCommand>({ store, broadcast, clock, userScope });
		const result = await undo('item-1');

		expect(result.success).toBe(true);
		expect(result.command).toEqual(command);
	});

	it('deletes item from store on successful undo', async () => {
		const item = createTestItem({ id: 'item-1', undoUntil: clock.now() + 5000 });
		await store.put(item);

		const undo = createUndoHelper<TestCommand>({ store, broadcast, clock, userScope });
		await undo('item-1');

		expect(await store.get('item-1')).toBeUndefined();
	});

	it('broadcasts outbox_changed on successful undo', async () => {
		const item = createTestItem({ id: 'item-1', undoUntil: clock.now() + 5000 });
		await store.put(item);

		const undo = createUndoHelper<TestCommand>({ store, broadcast, clock, userScope });
		await undo('item-1');

		expect(broadcast.messages).toContainEqual({ type: 'outbox_changed', userScope });
	});

	it('returns failure when undo window has expired', async () => {
		const item = createTestItem({
			id: 'item-1',
			undoUntil: clock.now() - 1, // Already expired
		});
		await store.put(item);

		const undo = createUndoHelper<TestCommand>({ store, broadcast, clock, userScope });
		const result = await undo('item-1');

		expect(result.success).toBe(false);
		expect(result.command).toBeUndefined();
	});

	it('does not delete item when undo window has expired', async () => {
		const item = createTestItem({ id: 'item-1', undoUntil: clock.now() - 1 });
		await store.put(item);

		const undo = createUndoHelper<TestCommand>({ store, broadcast, clock, userScope });
		await undo('item-1');

		expect(await store.get('item-1')).toBeDefined();
	});

	it('returns failure for non-existent item', async () => {
		const undo = createUndoHelper<TestCommand>({ store, broadcast, clock, userScope });
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

		const undo = createUndoHelper<TestCommand>({ store, broadcast, clock, userScope });
		const result = await undo('item-1');

		expect(result.success).toBe(false);
	});

	it('returns failure exactly at undoUntil boundary', async () => {
		const item = createTestItem({
			id: 'item-1',
			undoUntil: clock.now(), // Exactly at boundary
		});
		await store.put(item);

		const undo = createUndoHelper<TestCommand>({ store, broadcast, clock, userScope });
		const result = await undo('item-1');

		// At exactly undoUntil, undo should fail (now >= undoUntil)
		expect(result.success).toBe(false);
	});
});

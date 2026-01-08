import { beforeEach, describe, expect, it } from 'vitest';
import { createMockOutboxStore, createOutboxStore, getDatabaseName } from '../store';
import type { OutboxItem } from '../types';

// Test command type
interface TestCommand {
	type: 'test';
	data: string;
}

// Helper to create a test item
function createTestItem(overrides: Partial<OutboxItem<TestCommand>> = {}): OutboxItem<TestCommand> {
	const now = Date.now();
	return {
		id: overrides.id ?? `item-${Math.random().toString(36).slice(2)}`,
		userScope: 'user-123',
		command: {
			type: 'test',
			data: 'test data',
		},
		createdAt: now,
		updatedAt: now,
		undoUntil: now + 5000,
		status: 'pending',
		attemptCount: 0,
		nextAttemptAt: now + 5000,
		...overrides,
	};
}

describe('getDatabaseName', () => {
	it('returns database name with user scope prefix', () => {
		expect(getDatabaseName('user-123')).toBe('outbox_user-123');
		expect(getDatabaseName('abc-def')).toBe('outbox_abc-def');
	});
});

describe('createMockOutboxStore', () => {
	let store: ReturnType<typeof createMockOutboxStore<TestCommand>>;

	beforeEach(() => {
		store = createMockOutboxStore<TestCommand>();
	});

	describe('put/get', () => {
		it('stores and retrieves an item', async () => {
			const item = createTestItem({ id: 'test-1' });

			await store.put(item);
			const retrieved = await store.get('test-1');

			expect(retrieved).toEqual(item);
		});

		it('returns undefined for non-existent item', async () => {
			const retrieved = await store.get('non-existent');
			expect(retrieved).toBeUndefined();
		});

		it('overwrites existing item with same id', async () => {
			const item1 = createTestItem({ id: 'test-1', attemptCount: 0 });
			const item2 = createTestItem({ id: 'test-1', attemptCount: 5 });

			await store.put(item1);
			await store.put(item2);

			const retrieved = await store.get('test-1');
			expect(retrieved?.attemptCount).toBe(5);
		});

		it('returns a copy (not reference)', async () => {
			const item = createTestItem({ id: 'test-1' });

			await store.put(item);
			const retrieved = await store.get('test-1');

			expect(retrieved).not.toBe(item);
		});
	});

	describe('delete', () => {
		it('removes an item', async () => {
			const item = createTestItem({ id: 'test-1' });

			await store.put(item);
			await store.delete('test-1');

			const retrieved = await store.get('test-1');
			expect(retrieved).toBeUndefined();
		});

		it('does not throw for non-existent item', async () => {
			await expect(store.delete('non-existent')).resolves.toBeUndefined();
		});
	});

	describe('listDue', () => {
		it('returns pending items with nextAttemptAt <= now', async () => {
			const now = Date.now();
			const pastItem = createTestItem({ id: 'past', nextAttemptAt: now - 1000 });
			const nowItem = createTestItem({ id: 'now', nextAttemptAt: now });
			const futureItem = createTestItem({ id: 'future', nextAttemptAt: now + 1000 });

			await store.put(pastItem);
			await store.put(nowItem);
			await store.put(futureItem);

			const due = await store.listDue(now, 'user-123');

			expect(due).toHaveLength(2);
			expect(due.map((i) => i.id)).toContain('past');
			expect(due.map((i) => i.id)).toContain('now');
			expect(due.map((i) => i.id)).not.toContain('future');
		});

		it('excludes non-pending items', async () => {
			const now = Date.now();
			const pendingItem = createTestItem({ id: 'pending', status: 'pending', nextAttemptAt: now - 1000 });
			const failedItem = createTestItem({ id: 'failed', status: 'failed', nextAttemptAt: now - 1000 });
			const blockedItem = createTestItem({ id: 'blocked', status: 'blocked_auth', nextAttemptAt: now - 1000 });

			await store.put(pendingItem);
			await store.put(failedItem);
			await store.put(blockedItem);

			const due = await store.listDue(now, 'user-123');

			expect(due).toHaveLength(1);
			expect(due[0].id).toBe('pending');
		});

		it('filters by userScope', async () => {
			const now = Date.now();
			const user1Item = createTestItem({ id: 'user1', userScope: 'user-1', nextAttemptAt: now - 1000 });
			const user2Item = createTestItem({ id: 'user2', userScope: 'user-2', nextAttemptAt: now - 1000 });

			await store.put(user1Item);
			await store.put(user2Item);

			const due = await store.listDue(now, 'user-1');

			expect(due).toHaveLength(1);
			expect(due[0].id).toBe('user1');
		});

		it('returns items sorted by nextAttemptAt (FIFO)', async () => {
			const now = Date.now();
			const item1 = createTestItem({ id: 'item1', nextAttemptAt: now - 3000 });
			const item2 = createTestItem({ id: 'item2', nextAttemptAt: now - 1000 });
			const item3 = createTestItem({ id: 'item3', nextAttemptAt: now - 2000 });

			await store.put(item1);
			await store.put(item2);
			await store.put(item3);

			const due = await store.listDue(now, 'user-123');

			expect(due.map((i) => i.id)).toEqual(['item1', 'item3', 'item2']);
		});
	});

	describe('countByStatus', () => {
		it('counts items by status', async () => {
			await store.put(createTestItem({ id: '1', status: 'pending' }));
			await store.put(createTestItem({ id: '2', status: 'pending' }));
			await store.put(createTestItem({ id: '3', status: 'failed' }));
			await store.put(createTestItem({ id: '4', status: 'blocked_auth' }));

			const counts = await store.countByStatus('user-123');

			expect(counts).toEqual({
				pending: 2,
				failed: 1,
				blocked_auth: 1,
			});
		});

		it('returns zeros for empty store', async () => {
			const counts = await store.countByStatus('user-123');

			expect(counts).toEqual({
				pending: 0,
				failed: 0,
				blocked_auth: 0,
			});
		});

		it('filters by userScope', async () => {
			await store.put(createTestItem({ id: '1', userScope: 'user-1', status: 'pending' }));
			await store.put(createTestItem({ id: '2', userScope: 'user-2', status: 'pending' }));

			const counts = await store.countByStatus('user-1');

			expect(counts).toEqual({
				pending: 1,
				failed: 0,
				blocked_auth: 0,
			});
		});
	});

	describe('listByStatus', () => {
		it('lists items by status', async () => {
			await store.put(createTestItem({ id: '1', status: 'pending' }));
			await store.put(createTestItem({ id: '2', status: 'failed' }));
			await store.put(createTestItem({ id: '3', status: 'failed' }));

			const failed = await store.listByStatus('user-123', 'failed');

			expect(failed).toHaveLength(2);
			expect(failed.map((i) => i.id)).toContain('2');
			expect(failed.map((i) => i.id)).toContain('3');
		});

		it('returns items sorted by createdAt', async () => {
			const now = Date.now();
			await store.put(createTestItem({ id: '1', status: 'failed', createdAt: now - 1000 }));
			await store.put(createTestItem({ id: '2', status: 'failed', createdAt: now - 3000 }));
			await store.put(createTestItem({ id: '3', status: 'failed', createdAt: now - 2000 }));

			const failed = await store.listByStatus('user-123', 'failed');

			expect(failed.map((i) => i.id)).toEqual(['2', '3', '1']);
		});

		it('filters by userScope', async () => {
			await store.put(createTestItem({ id: '1', userScope: 'user-1', status: 'failed' }));
			await store.put(createTestItem({ id: '2', userScope: 'user-2', status: 'failed' }));

			const failed = await store.listByStatus('user-1', 'failed');

			expect(failed).toHaveLength(1);
			expect(failed[0].id).toBe('1');
		});
	});

	describe('clear', () => {
		it('removes all items', async () => {
			await store.put(createTestItem({ id: '1' }));
			await store.put(createTestItem({ id: '2' }));

			store.clear();

			expect(await store.get('1')).toBeUndefined();
			expect(await store.get('2')).toBeUndefined();
		});
	});
});

describe('createOutboxStore (IndexedDB)', () => {
	// Use unique user scope per test to avoid cross-test contamination
	let testCounter = 0;
	function getUniqueScope(): string {
		return `idb-test-${Date.now()}-${++testCounter}`;
	}

	describe('put/get', () => {
		it('stores and retrieves an item', async () => {
			const userScope = getUniqueScope();
			const store = createOutboxStore<TestCommand>(userScope);
			const item = createTestItem({ id: 'idb-test-1', userScope });

			await store.put(item);
			const retrieved = await store.get('idb-test-1');

			expect(retrieved).toEqual(item);
		});

		it('returns undefined for non-existent item', async () => {
			const userScope = getUniqueScope();
			const store = createOutboxStore<TestCommand>(userScope);

			const retrieved = await store.get('non-existent');
			expect(retrieved).toBeUndefined();
		});
	});

	describe('delete', () => {
		it('removes an item', async () => {
			const userScope = getUniqueScope();
			const store = createOutboxStore<TestCommand>(userScope);
			const item = createTestItem({ id: 'idb-delete-1', userScope });

			await store.put(item);
			await store.delete('idb-delete-1');

			const retrieved = await store.get('idb-delete-1');
			expect(retrieved).toBeUndefined();
		});
	});

	describe('listDue', () => {
		it('returns pending items with nextAttemptAt <= now', async () => {
			const userScope = getUniqueScope();
			const store = createOutboxStore<TestCommand>(userScope);
			const now = Date.now();
			const pastItem = createTestItem({ id: 'idb-past', userScope, nextAttemptAt: now - 1000 });
			const futureItem = createTestItem({ id: 'idb-future', userScope, nextAttemptAt: now + 10000 });

			await store.put(pastItem);
			await store.put(futureItem);

			const due = await store.listDue(now, userScope);

			expect(due).toHaveLength(1);
			expect(due[0].id).toBe('idb-past');
		});
	});

	describe('countByStatus', () => {
		it('counts items by status', async () => {
			const userScope = getUniqueScope();
			const store = createOutboxStore<TestCommand>(userScope);

			await store.put(createTestItem({ id: 'idb-p1', userScope, status: 'pending' }));
			await store.put(createTestItem({ id: 'idb-p2', userScope, status: 'pending' }));
			await store.put(createTestItem({ id: 'idb-f1', userScope, status: 'failed' }));

			const counts = await store.countByStatus(userScope);

			expect(counts.pending).toBe(2);
			expect(counts.failed).toBe(1);
			expect(counts.blocked_auth).toBe(0);
		});
	});

	describe('listByStatus', () => {
		it('lists items by status', async () => {
			const userScope = getUniqueScope();
			const store = createOutboxStore<TestCommand>(userScope);

			await store.put(createTestItem({ id: 'idb-s1', userScope, status: 'pending' }));
			await store.put(createTestItem({ id: 'idb-s2', userScope, status: 'failed' }));

			const pending = await store.listByStatus(userScope, 'pending');
			const failed = await store.listByStatus(userScope, 'failed');

			expect(pending).toHaveLength(1);
			expect(pending[0].id).toBe('idb-s1');
			expect(failed).toHaveLength(1);
			expect(failed[0].id).toBe('idb-s2');
		});
	});
});

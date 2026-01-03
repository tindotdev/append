/**
 * IndexedDB-backed outbox persistence store.
 *
 * Each user gets their own database (named `outbox_${userScope}`) to prevent
 * cross-user data leakage on shared devices.
 *
 * Schema:
 * - Object store: outbox_items (keyPath: id)
 * - Index: by_status_nextAttempt [status, nextAttemptAt] for listDue queries
 * - Index: by_status [status] for countByStatus and listByStatus queries
 */

import { IDB_STORE_NAME, IDB_VERSION, LEASE_STORE_NAME } from './constants';
import type { OutboxItem, OutboxStatus, OutboxStore } from './types';

/**
 * Get the database name for a user scope.
 */
export function getDatabaseName(userScope: string): string {
	return `outbox_${userScope}`;
}

/**
 * Open the IndexedDB database, creating object stores if needed.
 */
function openDatabase(userScope: string): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(getDatabaseName(userScope), IDB_VERSION);

		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);

		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			const oldVersion = event.oldVersion;

			// v1: outbox_items store
			if (oldVersion < 1) {
				if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
					const store = db.createObjectStore(IDB_STORE_NAME, { keyPath: 'id' });

					// Compound index for listDue: status + nextAttemptAt
					// Allows efficient range queries for pending items that are due
					store.createIndex('by_status_nextAttempt', ['status', 'nextAttemptAt'], {
						unique: false,
					});

					// Index for countByStatus and listByStatus
					store.createIndex('by_status', 'status', { unique: false });
				}
			}

			// v2: leadership_lease store for cross-tab coordination
			if (oldVersion < 2) {
				if (!db.objectStoreNames.contains(LEASE_STORE_NAME)) {
					db.createObjectStore(LEASE_STORE_NAME, { keyPath: 'key' });
				}
			}
		};
	});
}

/**
 * Create an IndexedDB-backed outbox store for a user.
 *
 * @param userScope - User scope for database isolation (typically session.user.id)
 */
export function createOutboxStore(userScope: string): OutboxStore {
	let dbPromise: Promise<IDBDatabase> | null = null;

	function getDb(): Promise<IDBDatabase> {
		if (!dbPromise) {
			dbPromise = openDatabase(userScope);
		}
		return dbPromise;
	}

	return {
		async put(item: OutboxItem): Promise<void> {
			const db = await getDb();
			return new Promise((resolve, reject) => {
				const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
				const store = tx.objectStore(IDB_STORE_NAME);
				const request = store.put(item);
				request.onerror = () => reject(request.error);
				request.onsuccess = () => resolve();
			});
		},

		async get(id: string): Promise<OutboxItem | undefined> {
			const db = await getDb();
			return new Promise((resolve, reject) => {
				const tx = db.transaction(IDB_STORE_NAME, 'readonly');
				const store = tx.objectStore(IDB_STORE_NAME);
				const request = store.get(id);
				request.onerror = () => reject(request.error);
				request.onsuccess = () => resolve(request.result ?? undefined);
			});
		},

		async delete(id: string): Promise<void> {
			const db = await getDb();
			return new Promise((resolve, reject) => {
				const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
				const store = tx.objectStore(IDB_STORE_NAME);
				const request = store.delete(id);
				request.onerror = () => reject(request.error);
				request.onsuccess = () => resolve();
			});
		},

		async listDue(now: number, _userScope: string): Promise<OutboxItem[]> {
			const db = await getDb();
			return new Promise((resolve, reject) => {
				const tx = db.transaction(IDB_STORE_NAME, 'readonly');
				const store = tx.objectStore(IDB_STORE_NAME);
				const index = store.index('by_status_nextAttempt');

				// Range: status='pending' and nextAttemptAt <= now
				// IDB compound index range: lower bound ['pending', 0], upper bound ['pending', now]
				const range = IDBKeyRange.bound(['pending', 0], ['pending', now]);
				const request = index.getAll(range);

				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					// Sort by nextAttemptAt (FIFO by eligibility time)
					const items = (request.result as OutboxItem[]).sort((a, b) => a.nextAttemptAt - b.nextAttemptAt);
					resolve(items);
				};
			});
		},

		async countByStatus(_userScope: string): Promise<Record<OutboxStatus, number>> {
			const db = await getDb();
			return new Promise((resolve, reject) => {
				const tx = db.transaction(IDB_STORE_NAME, 'readonly');
				const store = tx.objectStore(IDB_STORE_NAME);
				const request = store.getAll();

				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					const items = request.result as OutboxItem[];
					const counts: Record<OutboxStatus, number> = {
						pending: 0,
						failed: 0,
						blocked_auth: 0,
					};
					for (const item of items) {
						counts[item.status]++;
					}
					resolve(counts);
				};
			});
		},

		async listByStatus(_userScope: string, status: OutboxStatus): Promise<OutboxItem[]> {
			const db = await getDb();
			return new Promise((resolve, reject) => {
				const tx = db.transaction(IDB_STORE_NAME, 'readonly');
				const store = tx.objectStore(IDB_STORE_NAME);
				const index = store.index('by_status');
				const request = index.getAll(status);

				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					// Sort by createdAt (oldest first)
					const items = (request.result as OutboxItem[]).sort((a, b) => a.createdAt - b.createdAt);
					resolve(items);
				};
			});
		},
	};
}

/**
 * Create an in-memory mock store for unit tests.
 *
 * This avoids requiring IndexedDB in tests that don't need persistence.
 */
export function createMockOutboxStore(): OutboxStore & {
	/** Direct access to items map for test assertions */
	items: Map<string, OutboxItem>;
	/** Clear all items */
	clear(): void;
} {
	const items = new Map<string, OutboxItem>();

	return {
		items,

		clear(): void {
			items.clear();
		},

		async put(item: OutboxItem): Promise<void> {
			items.set(item.id, { ...item });
		},

		async get(id: string): Promise<OutboxItem | undefined> {
			const item = items.get(id);
			return item ? { ...item } : undefined;
		},

		async delete(id: string): Promise<void> {
			items.delete(id);
		},

		async listDue(now: number, userScope: string): Promise<OutboxItem[]> {
			return Array.from(items.values())
				.filter((item) => item.userScope === userScope && item.status === 'pending' && item.nextAttemptAt <= now)
				.sort((a, b) => a.nextAttemptAt - b.nextAttemptAt);
		},

		async countByStatus(userScope: string): Promise<Record<OutboxStatus, number>> {
			const counts: Record<OutboxStatus, number> = {
				pending: 0,
				failed: 0,
				blocked_auth: 0,
			};
			for (const item of items.values()) {
				if (item.userScope === userScope) {
					counts[item.status]++;
				}
			}
			return counts;
		},

		async listByStatus(userScope: string, status: OutboxStatus): Promise<OutboxItem[]> {
			return Array.from(items.values())
				.filter((item) => item.userScope === userScope && item.status === status)
				.sort((a, b) => a.createdAt - b.createdAt);
		},
	};
}

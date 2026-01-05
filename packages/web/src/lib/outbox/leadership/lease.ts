/**
 * IndexedDB lease leadership provider.
 *
 * Fallback when Web Locks is unavailable. Uses a lease row in IDB with:
 * - holderId: which tab owns the lease
 * - expiresAt: when the lease expires
 *
 * A tab can take over if: no lease, lease expired, or it already owns the lease.
 */

import { LEASE_MS, LEASE_STORE_NAME } from '../constants';
import { openDatabase } from '../store';
import type { Clock } from '../types';
import type { LeadershipDeps, LeadershipProvider, LeadershipSession, LeaseRecord, LeaseStore } from './types';

/**
 * Options for creating a lease store.
 */
export interface LeaseStoreOptions {
	/** User scope for database isolation */
	userScope: string;
	/** Clock for time operations (defaults to Date.now) */
	clock?: Clock;
}

/**
 * Create a lease store backed by IndexedDB.
 *
 * Uses the same per-user database as the outbox items but a separate object store.
 */
export function createLeaseStore(options: LeaseStoreOptions): LeaseStore {
	const { userScope, clock = { now: () => Date.now() } } = options;
	let dbPromise: Promise<IDBDatabase> | null = null;

	// Use shared openDatabase to ensure all stores are created
	// regardless of whether lease or outbox opens the DB first
	function getDb(): Promise<IDBDatabase> {
		if (!dbPromise) {
			dbPromise = openDatabase(userScope);
		}
		return dbPromise;
	}

	return {
		async get(): Promise<LeaseRecord | undefined> {
			const db = await getDb();
			return new Promise((resolve, reject) => {
				const tx = db.transaction(LEASE_STORE_NAME, 'readonly');
				const store = tx.objectStore(LEASE_STORE_NAME);
				const request = store.get('lease');
				request.onerror = () => reject(request.error);
				request.onsuccess = () => resolve(request.result ?? undefined);
			});
		},

		async tryAcquire(holderId: string, expiresAt: number): Promise<boolean> {
			const db = await getDb();
			return new Promise((resolve, reject) => {
				const tx = db.transaction(LEASE_STORE_NAME, 'readwrite');
				const store = tx.objectStore(LEASE_STORE_NAME);
				const getRequest = store.get('lease');

				getRequest.onerror = () => reject(getRequest.error);
				getRequest.onsuccess = () => {
					const existing = getRequest.result as LeaseRecord | undefined;
					const now = clock.now();

					// Can acquire if: no lease, expired, or we own it
					const canAcquire = !existing || existing.expiresAt <= now || existing.holderId === holderId;

					if (canAcquire) {
						const newLease: LeaseRecord = { key: 'lease', holderId, expiresAt };
						const putRequest = store.put(newLease);
						putRequest.onerror = () => reject(putRequest.error);
						putRequest.onsuccess = () => resolve(true);
					} else {
						resolve(false);
					}
				};
			});
		},

		async release(holderId: string): Promise<void> {
			const db = await getDb();
			return new Promise((resolve, reject) => {
				const tx = db.transaction(LEASE_STORE_NAME, 'readwrite');
				const store = tx.objectStore(LEASE_STORE_NAME);
				const getRequest = store.get('lease');

				getRequest.onerror = () => reject(getRequest.error);
				getRequest.onsuccess = () => {
					const existing = getRequest.result as LeaseRecord | undefined;
					// Only delete if we own it
					if (existing?.holderId === holderId) {
						const deleteRequest = store.delete('lease');
						deleteRequest.onerror = () => reject(deleteRequest.error);
						deleteRequest.onsuccess = () => resolve();
					} else {
						resolve();
					}
				};
			});
		},
	};
}

/**
 * Create a lease-based leadership provider.
 *
 * Uses IndexedDB to store a lease record with TTL. Other tabs can take over
 * if the lease expires without renewal.
 */
export function createLeaseProvider(deps: LeadershipDeps): LeadershipProvider {
	const { clock, tabId, userScope } = deps;
	const store = createLeaseStore({ userScope, clock });

	return {
		type: 'lease',

		isAvailable(): boolean {
			return typeof indexedDB !== 'undefined';
		},

		async tryAcquire(): Promise<LeadershipSession | null> {
			const now = clock.now();
			const expiresAt = now + LEASE_MS;

			const acquired = await store.tryAcquire(tabId, expiresAt);
			if (!acquired) return null;

			const sessionId = `${tabId}-${now}`;

			return {
				sessionId,
				async release() {
					await store.release(tabId);
				},
				async renew() {
					const renewedExpiresAt = clock.now() + LEASE_MS;
					await store.tryAcquire(tabId, renewedExpiresAt);
				},
			};
		},
	};
}

/**
 * Create an in-memory mock lease store for unit tests.
 */
export function createMockLeaseStore(): LeaseStore & {
	/** Direct access to lease for test assertions */
	lease: LeaseRecord | undefined;
	/** Clear the lease */
	clear(): void;
	/** Set the current time for expiry checks */
	setNow(now: number): void;
} {
	let lease: LeaseRecord | undefined;
	let currentNow = Date.now();

	return {
		get lease() {
			return lease;
		},

		clear() {
			lease = undefined;
		},

		setNow(now: number) {
			currentNow = now;
		},

		async get(): Promise<LeaseRecord | undefined> {
			return lease ? { ...lease } : undefined;
		},

		async tryAcquire(holderId: string, expiresAt: number): Promise<boolean> {
			const canAcquire = !lease || lease.expiresAt <= currentNow || lease.holderId === holderId;

			if (canAcquire) {
				lease = { key: 'lease', holderId, expiresAt };
				return true;
			}
			return false;
		},

		async release(holderId: string): Promise<void> {
			if (lease?.holderId === holderId) {
				lease = undefined;
			}
		},
	};
}

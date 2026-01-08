import { beforeEach, describe, expect, it } from 'vitest';
import { LEASE_MS } from '../../constants';
import type { Clock } from '../../types';
import { createLeaseProvider, createLeaseStore, createMockLeaseStore } from '../lease';

// Helper to create a mock clock
function createMockClock(initialTime = 1000): Clock & { advance(ms: number): void; set(time: number): void } {
	let currentTime = initialTime;
	return {
		now: () => currentTime,
		advance: (ms: number) => {
			currentTime += ms;
		},
		set: (time: number) => {
			currentTime = time;
		},
	};
}

// Generate unique user scope to avoid cross-test IDB contamination
function uniqueUserScope(): string {
	return `user-${Math.random().toString(36).slice(2)}`;
}

describe('createMockLeaseStore', () => {
	let store: ReturnType<typeof createMockLeaseStore>;

	beforeEach(() => {
		store = createMockLeaseStore();
	});

	describe('get', () => {
		it('returns undefined when no lease exists', async () => {
			const lease = await store.get();
			expect(lease).toBeUndefined();
		});

		it('returns lease when one exists', async () => {
			await store.tryAcquire('tab-1', 2000);
			const lease = await store.get();
			expect(lease).toEqual({ key: 'lease', holderId: 'tab-1', expiresAt: 2000 });
		});
	});

	describe('tryAcquire', () => {
		it('succeeds when no lease exists', async () => {
			const result = await store.tryAcquire('tab-1', 2000);
			expect(result).toBe(true);
			expect(store.lease).toEqual({ key: 'lease', holderId: 'tab-1', expiresAt: 2000 });
		});

		it('fails when lease held by another tab (not expired)', async () => {
			store.setNow(1000);
			await store.tryAcquire('tab-1', 2000);

			const result = await store.tryAcquire('tab-2', 3000);
			expect(result).toBe(false);
			expect(store.lease?.holderId).toBe('tab-1');
		});

		it('succeeds when we already own the lease (renew)', async () => {
			await store.tryAcquire('tab-1', 2000);

			const result = await store.tryAcquire('tab-1', 3000);
			expect(result).toBe(true);
			expect(store.lease?.expiresAt).toBe(3000);
		});

		it('succeeds when lease has expired', async () => {
			store.setNow(1000);
			await store.tryAcquire('tab-1', 1500);

			// Advance time past expiry
			store.setNow(2000);

			const result = await store.tryAcquire('tab-2', 3000);
			expect(result).toBe(true);
			expect(store.lease?.holderId).toBe('tab-2');
		});
	});

	describe('release', () => {
		it('clears lease when we own it', async () => {
			await store.tryAcquire('tab-1', 2000);

			await store.release('tab-1');
			expect(store.lease).toBeUndefined();
		});

		it('does nothing when we do not own the lease', async () => {
			await store.tryAcquire('tab-1', 2000);

			await store.release('tab-2');
			expect(store.lease?.holderId).toBe('tab-1');
		});

		it('does nothing when no lease exists', async () => {
			await store.release('tab-1');
			expect(store.lease).toBeUndefined();
		});
	});

	describe('clear', () => {
		it('removes the lease', async () => {
			await store.tryAcquire('tab-1', 2000);

			store.clear();
			expect(store.lease).toBeUndefined();
		});
	});
});

describe('createLeaseStore (IndexedDB)', () => {
	it('stores and retrieves lease', async () => {
		const clock = createMockClock(1000);
		const store = createLeaseStore({ userScope: uniqueUserScope(), clock });

		await store.tryAcquire('tab-1', clock.now() + 10000);
		const lease = await store.get();

		expect(lease).toBeDefined();
		expect(lease?.holderId).toBe('tab-1');
	});

	it('allows same holder to renew', async () => {
		const clock = createMockClock(1000);
		const store = createLeaseStore({ userScope: uniqueUserScope(), clock });

		await store.tryAcquire('tab-1', clock.now() + 5000);
		const result = await store.tryAcquire('tab-1', clock.now() + 10000);

		expect(result).toBe(true);
		const lease = await store.get();
		expect(lease?.holderId).toBe('tab-1');
	});

	it('blocks different holder when lease not expired', async () => {
		const clock = createMockClock(1000);
		const store = createLeaseStore({ userScope: uniqueUserScope(), clock });

		await store.tryAcquire('tab-1', clock.now() + 10000);
		const result = await store.tryAcquire('tab-2', clock.now() + 10000);

		expect(result).toBe(false);
	});

	it('allows takeover when lease expired', async () => {
		const clock = createMockClock(1000);
		const store = createLeaseStore({ userScope: uniqueUserScope(), clock });

		// Set an already-expired lease
		await store.tryAcquire('tab-1', clock.now() - 1000);

		const result = await store.tryAcquire('tab-2', clock.now() + 10000);

		expect(result).toBe(true);
		const lease = await store.get();
		expect(lease?.holderId).toBe('tab-2');
	});

	it('releases when we own the lease', async () => {
		const clock = createMockClock(1000);
		const store = createLeaseStore({ userScope: uniqueUserScope(), clock });

		await store.tryAcquire('tab-1', clock.now() + 10000);
		await store.release('tab-1');

		const lease = await store.get();
		expect(lease).toBeUndefined();
	});

	it('does not release when we do not own the lease', async () => {
		const clock = createMockClock(1000);
		const store = createLeaseStore({ userScope: uniqueUserScope(), clock });

		await store.tryAcquire('tab-1', clock.now() + 10000);
		await store.release('tab-2');

		const lease = await store.get();
		expect(lease?.holderId).toBe('tab-1');
	});
});

describe('createLeaseProvider', () => {
	describe('isAvailable', () => {
		it('returns true when indexedDB is available', () => {
			const clock = createMockClock();
			const provider = createLeaseProvider({
				clock,
				tabId: 'tab-1',
				userScope: uniqueUserScope(),
			});

			expect(provider.isAvailable()).toBe(true);
		});

		it('has type lease', () => {
			const clock = createMockClock();
			const provider = createLeaseProvider({
				clock,
				tabId: 'tab-1',
				userScope: uniqueUserScope(),
			});

			expect(provider.type).toBe('lease');
		});
	});

	describe('tryAcquire', () => {
		it('returns session on successful acquire', async () => {
			const clock = createMockClock(1000);
			const provider = createLeaseProvider({
				clock,
				tabId: 'tab-1',
				userScope: uniqueUserScope(),
			});

			const session = await provider.tryAcquire();

			expect(session).not.toBeNull();
			expect(session?.sessionId).toContain('tab-1');
		});

		it('session has release and renew methods', async () => {
			const clock = createMockClock(1000);
			const provider = createLeaseProvider({
				clock,
				tabId: 'tab-1',
				userScope: uniqueUserScope(),
			});

			const session = await provider.tryAcquire();

			expect(typeof session?.release).toBe('function');
			expect(typeof session?.renew).toBe('function');
		});

		it('returns null when another tab holds the lease', async () => {
			const userScope = uniqueUserScope();
			const clock = createMockClock(1000);

			const provider1 = createLeaseProvider({
				clock,
				tabId: 'tab-1',
				userScope,
			});

			const provider2 = createLeaseProvider({
				clock,
				tabId: 'tab-2',
				userScope,
			});

			await provider1.tryAcquire();
			const session2 = await provider2.tryAcquire();

			expect(session2).toBeNull();
		});
	});

	describe('session.release', () => {
		it('clears the lease', async () => {
			const userScope = uniqueUserScope();
			const clock = createMockClock(1000);

			const provider = createLeaseProvider({
				clock,
				tabId: 'tab-1',
				userScope,
			});

			const session = await provider.tryAcquire();
			await session?.release();

			// Another provider should now be able to acquire
			const provider2 = createLeaseProvider({
				clock,
				tabId: 'tab-2',
				userScope,
			});

			const session2 = await provider2.tryAcquire();
			expect(session2).not.toBeNull();
		});
	});

	describe('session.renew', () => {
		it('extends the lease expiry', async () => {
			const userScope = uniqueUserScope();
			const clock = createMockClock(1000);

			const provider = createLeaseProvider({
				clock,
				tabId: 'tab-1',
				userScope,
			});

			const session = await provider.tryAcquire();

			// Advance time by half the lease duration
			clock.advance(LEASE_MS / 2);

			await session?.renew();

			// Advance time to just before renewed expiry
			// Original expiry was at 11000 (1000 + 10000)
			// Renewed expiry is at 16000 (6000 + 10000)
			// So we advance to 15000 (before renewal expiry but after original)
			clock.advance(LEASE_MS - 1000);

			// Session should still be valid because we renewed
			// Another tab should NOT be able to acquire
			const provider2 = createLeaseProvider({
				clock,
				tabId: 'tab-2',
				userScope,
			});

			const session2 = await provider2.tryAcquire();
			expect(session2).toBeNull();
		});
	});

	describe('lease expiry and takeover', () => {
		it('allows takeover after lease expires', async () => {
			const userScope = uniqueUserScope();
			const clock = createMockClock(1000);

			const provider1 = createLeaseProvider({
				clock,
				tabId: 'tab-1',
				userScope,
			});

			await provider1.tryAcquire();

			// Advance time past lease expiry
			clock.advance(LEASE_MS + 1000);

			const provider2 = createLeaseProvider({
				clock,
				tabId: 'tab-2',
				userScope,
			});

			const session2 = await provider2.tryAcquire();
			expect(session2).not.toBeNull();
			expect(session2?.sessionId).toContain('tab-2');
		});
	});
});

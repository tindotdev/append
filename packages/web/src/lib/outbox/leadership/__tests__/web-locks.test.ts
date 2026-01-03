import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../types';
import { createWebLocksProvider } from '../web-locks';

// Helper to create a mock clock
function createMockClock(initialTime = 1000): Clock {
	return {
		now: () => initialTime,
	};
}

describe('createWebLocksProvider', () => {
	afterEach(() => {
		// Restore original navigator
		vi.unstubAllGlobals();
	});

	describe('isAvailable', () => {
		it('returns true when navigator.locks exists', () => {
			vi.stubGlobal('navigator', {
				locks: {
					request: vi.fn(),
				},
			});

			const provider = createWebLocksProvider({
				clock: createMockClock(),
				tabId: 'tab-1',
				userScope: 'user-1',
			});

			expect(provider.isAvailable()).toBe(true);
		});

		it('returns false when navigator is undefined', () => {
			vi.stubGlobal('navigator', undefined);

			const provider = createWebLocksProvider({
				clock: createMockClock(),
				tabId: 'tab-1',
				userScope: 'user-1',
			});

			expect(provider.isAvailable()).toBe(false);
		});

		it('returns false when navigator.locks is missing', () => {
			vi.stubGlobal('navigator', {});

			const provider = createWebLocksProvider({
				clock: createMockClock(),
				tabId: 'tab-1',
				userScope: 'user-1',
			});

			expect(provider.isAvailable()).toBe(false);
		});

		it('has type web-locks', () => {
			vi.stubGlobal('navigator', {
				locks: {
					request: vi.fn(),
				},
			});

			const provider = createWebLocksProvider({
				clock: createMockClock(),
				tabId: 'tab-1',
				userScope: 'user-1',
			});

			expect(provider.type).toBe('web-locks');
		});
	});

	describe('tryAcquire', () => {
		it('returns null when navigator.locks is unavailable', async () => {
			vi.stubGlobal('navigator', {});

			const provider = createWebLocksProvider({
				clock: createMockClock(),
				tabId: 'tab-1',
				userScope: 'user-1',
			});

			const session = await provider.tryAcquire();
			expect(session).toBeNull();
		});

		it('returns session when lock is acquired', async () => {
			const mockRequest = vi.fn(async (name: string, _options: LockOptions, callback: (lock: Lock | null) => Promise<void>) => {
				// Simulate lock granted
				const mockLock: Lock = { name, mode: 'exclusive' };
				await callback(mockLock);
			});

			vi.stubGlobal('navigator', {
				locks: {
					request: mockRequest,
				},
			});

			const provider = createWebLocksProvider({
				clock: createMockClock(),
				tabId: 'tab-1',
				userScope: 'user-1',
			});

			const sessionPromise = provider.tryAcquire();

			// Wait a tick for the promise to settle
			await vi.waitFor(async () => {
				const session = await Promise.race([sessionPromise, Promise.resolve('pending')]);
				if (session === 'pending') throw new Error('Still pending');
			});

			const session = await sessionPromise;

			expect(session).not.toBeNull();
			expect(session?.sessionId).toContain('tab-1');
		});

		it('returns null when lock is held by another tab', async () => {
			const mockRequest = vi.fn(async (_name: string, _options: LockOptions, callback: (lock: Lock | null) => Promise<void>) => {
				// Simulate lock not available
				await callback(null);
			});

			vi.stubGlobal('navigator', {
				locks: {
					request: mockRequest,
				},
			});

			const provider = createWebLocksProvider({
				clock: createMockClock(),
				tabId: 'tab-1',
				userScope: 'user-1',
			});

			const session = await provider.tryAcquire();
			expect(session).toBeNull();
		});

		it('uses correct lock options', async () => {
			const mockRequest = vi.fn(async (_name: string, _options: LockOptions, callback: (lock: Lock | null) => Promise<void>) => {
				await callback(null);
			});

			vi.stubGlobal('navigator', {
				locks: {
					request: mockRequest,
				},
			});

			const provider = createWebLocksProvider({
				clock: createMockClock(),
				tabId: 'tab-1',
				userScope: 'user-1',
			});

			await provider.tryAcquire();

			expect(mockRequest).toHaveBeenCalledWith('outbox-sender', { mode: 'exclusive', ifAvailable: true }, expect.any(Function));
		});

		it('returns null when navigator.locks.request throws', async () => {
			const mockRequest = vi.fn().mockRejectedValue(new Error('Lock API error'));

			vi.stubGlobal('navigator', {
				locks: {
					request: mockRequest,
				},
			});

			const provider = createWebLocksProvider({
				clock: createMockClock(),
				tabId: 'tab-1',
				userScope: 'user-1',
			});

			const session = await provider.tryAcquire();
			expect(session).toBeNull();
		});
	});

	describe('session.release', () => {
		it('resolves the lock callback to release the lock', async () => {
			let callbackResolved = false;

			const mockRequest = vi.fn(async (name: string, _options: LockOptions, callback: (lock: Lock | null) => Promise<void>) => {
				const mockLock: Lock = { name, mode: 'exclusive' };
				const result = callback(mockLock);

				// Store resolver for later
				result.then(() => {
					callbackResolved = true;
				});

				// Wait for release
				await result;
			});

			vi.stubGlobal('navigator', {
				locks: {
					request: mockRequest,
				},
			});

			const provider = createWebLocksProvider({
				clock: createMockClock(),
				tabId: 'tab-1',
				userScope: 'user-1',
			});

			const sessionPromise = provider.tryAcquire();

			// Wait for session
			await vi.waitFor(async () => {
				const result = await Promise.race([sessionPromise, Promise.resolve('pending')]);
				if (result === 'pending') throw new Error('Still pending');
			});

			const session = await sessionPromise;
			expect(session).not.toBeNull();

			// Release the lock
			await session?.release();

			// Give time for the callback to resolve
			await vi.waitFor(() => {
				if (!callbackResolved) throw new Error('Callback not resolved');
			});

			expect(callbackResolved).toBe(true);
		});
	});

	describe('session.renew', () => {
		it('is a no-op for web locks', async () => {
			let lockReleased = false;

			const mockRequest = vi.fn(async (name: string, _options: LockOptions, callback: (lock: Lock | null) => Promise<void>) => {
				const mockLock: Lock = { name, mode: 'exclusive' };
				await callback(mockLock);
				lockReleased = true;
			});

			vi.stubGlobal('navigator', {
				locks: {
					request: mockRequest,
				},
			});

			const provider = createWebLocksProvider({
				clock: createMockClock(),
				tabId: 'tab-1',
				userScope: 'user-1',
			});

			const sessionPromise = provider.tryAcquire();

			await vi.waitFor(async () => {
				const result = await Promise.race([sessionPromise, Promise.resolve('pending')]);
				if (result === 'pending') throw new Error('Still pending');
			});

			const session = await sessionPromise;

			// Renew should not throw or affect the lock
			await session?.renew();

			// Lock should still be held (not released)
			expect(lockReleased).toBe(false);

			// Clean up
			await session?.release();
		});
	});
});

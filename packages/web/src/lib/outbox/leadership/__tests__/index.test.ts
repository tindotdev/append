import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLeadershipProvider } from '../index';
import { createLeaseProvider } from '../lease';
import type { LeadershipProvider, LeadershipSession } from '../types';
import { createWebLocksProvider } from '../web-locks';

vi.mock('../lease', () => ({
	createLeaseProvider: vi.fn(),
}));

vi.mock('../web-locks', () => ({
	createWebLocksProvider: vi.fn(),
}));

describe('createLeadershipProvider', () => {
	const deps = {
		clock: { now: () => 1000 },
		tabId: 'tab-1',
		userScope: 'user-1',
	};

	const mockCreateLeaseProvider = vi.mocked(createLeaseProvider);
	const mockCreateWebLocksProvider = vi.mocked(createWebLocksProvider);

	beforeEach(() => {
		vi.resetAllMocks();
	});

	it('falls back to the lease provider when web locks throws', async () => {
		const leaseSession: LeadershipSession = {
			sessionId: 'lease-1',
			release: vi.fn().mockResolvedValue(undefined),
			renew: vi.fn().mockResolvedValue(undefined),
		};

		const leaseProvider: LeadershipProvider = {
			type: 'lease',
			isAvailable: () => true,
			tryAcquire: vi.fn().mockResolvedValue(leaseSession),
		};

		const webLocksProvider: LeadershipProvider = {
			type: 'web-locks',
			isAvailable: () => true,
			tryAcquire: vi.fn().mockRejectedValue(new Error('Lock API error')),
		};

		mockCreateLeaseProvider.mockReturnValue(leaseProvider);
		mockCreateWebLocksProvider.mockReturnValue(webLocksProvider);

		const provider = createLeadershipProvider(deps);
		const session = await provider.tryAcquire();

		expect(webLocksProvider.tryAcquire).toHaveBeenCalledTimes(1);
		expect(leaseProvider.tryAcquire).toHaveBeenCalledTimes(1);
		expect(session).toBe(leaseSession);
	});

	it('does not fall back when the web lock is held by another tab', async () => {
		const leaseProvider: LeadershipProvider = {
			type: 'lease',
			isAvailable: () => true,
			tryAcquire: vi.fn().mockResolvedValue({
				sessionId: 'lease-1',
				release: vi.fn().mockResolvedValue(undefined),
				renew: vi.fn().mockResolvedValue(undefined),
			}),
		};

		const webLocksProvider: LeadershipProvider = {
			type: 'web-locks',
			isAvailable: () => true,
			tryAcquire: vi.fn().mockResolvedValue(null),
		};

		mockCreateLeaseProvider.mockReturnValue(leaseProvider);
		mockCreateWebLocksProvider.mockReturnValue(webLocksProvider);

		const provider = createLeadershipProvider(deps);
		const session = await provider.tryAcquire();

		expect(session).toBeNull();
		expect(webLocksProvider.tryAcquire).toHaveBeenCalledTimes(1);
		expect(leaseProvider.tryAcquire).not.toHaveBeenCalled();
	});

	it('returns the lease provider when web locks are unavailable', async () => {
		const leaseProvider: LeadershipProvider = {
			type: 'lease',
			isAvailable: () => true,
			tryAcquire: vi.fn().mockResolvedValue(null),
		};

		const webLocksProvider: LeadershipProvider = {
			type: 'web-locks',
			isAvailable: () => false,
			tryAcquire: vi.fn().mockResolvedValue(null),
		};

		mockCreateLeaseProvider.mockReturnValue(leaseProvider);
		mockCreateWebLocksProvider.mockReturnValue(webLocksProvider);

		const provider = createLeadershipProvider(deps);
		await provider.tryAcquire();

		expect(provider).toBe(leaseProvider);
		expect(webLocksProvider.tryAcquire).not.toHaveBeenCalled();
	});
});

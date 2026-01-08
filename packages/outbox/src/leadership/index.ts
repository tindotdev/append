/**
 * Leadership provider factory.
 *
 * Creates the appropriate leadership provider based on environment capabilities:
 * - Primary: Web Locks (navigator.locks)
 * - Fallback: IndexedDB lease
 */

import { createLeaseProvider } from './lease';
import type { LeadershipDeps, LeadershipProvider, LeadershipSession } from './types';
import { createWebLocksProvider } from './web-locks';

// =============================================================================
// Re-exports
// =============================================================================

export { createLeaseProvider, createLeaseStore, createMockLeaseStore, type LeaseStoreOptions } from './lease';
export type { LeadershipDeps, LeadershipProvider, LeadershipSession, LeaseRecord, LeaseStore } from './types';
export { createWebLocksProvider } from './web-locks';

// =============================================================================
// Tab ID Generation
// =============================================================================

/**
 * Generate a unique tab ID for this browser tab/window.
 *
 * Uses crypto.randomUUID() for guaranteed uniqueness.
 * Should be called once per tab lifetime and stored.
 */
export function generateTabId(): string {
	return crypto.randomUUID();
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a leadership provider with automatic fallback.
 *
 * Uses Web Locks if available, otherwise falls back to IndexedDB lease.
 *
 * @param deps - Dependencies including clock, tabId, and userScope
 * @returns The appropriate leadership provider for the environment
 */
export function createLeadershipProvider(deps: LeadershipDeps): LeadershipProvider {
	const webLocksProvider = createWebLocksProvider(deps);

	if (webLocksProvider.isAvailable()) {
		const leaseProvider = createLeaseProvider(deps);
		let forceLease = false;

		return {
			type: 'web-locks',
			isAvailable(): boolean {
				return true;
			},
			async tryAcquire(): Promise<LeadershipSession | null> {
				if (forceLease) {
					return leaseProvider.tryAcquire();
				}

				try {
					return await webLocksProvider.tryAcquire();
				} catch {
					// Web Locks failed - fall back to the lease provider for this attempt.
					forceLease = true;
					return leaseProvider.tryAcquire();
				}
			},
		};
	}

	// Fall back to lease
	return createLeaseProvider(deps);
}

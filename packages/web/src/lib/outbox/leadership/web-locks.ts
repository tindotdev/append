/**
 * Web Locks leadership provider.
 *
 * Uses navigator.locks.request() with `mode: 'exclusive'` and `ifAvailable: true`
 * to attempt non-blocking lock acquisition.
 *
 * Strategy: Hold the lock only during active processing, then release.
 * This avoids frozen-background-tab issues on mobile.
 */

import type { LeadershipDeps, LeadershipProvider, LeadershipSession } from './types';

/** Lock name for outbox sender leadership */
const LOCK_NAME = 'outbox-sender';

/**
 * Create a Web Locks leadership provider.
 *
 * Uses the browser's Web Locks API for cross-tab coordination.
 * This is the primary leadership mechanism; falls back to IDB lease
 * if Web Locks is unavailable.
 */
export function createWebLocksProvider(deps: LeadershipDeps): LeadershipProvider {
	const { tabId } = deps;

	return {
		type: 'web-locks',

		isAvailable(): boolean {
			return typeof navigator !== 'undefined' && 'locks' in navigator;
		},

		async tryAcquire(): Promise<LeadershipSession | null> {
			if (!this.isAvailable()) return null;

			return new Promise((resolve) => {
				// Use ifAvailable: true for non-blocking acquisition
				navigator.locks
					.request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
						if (!lock) {
							// Lock is held by another tab
							resolve(null);
							return;
						}

						// We got the lock - create session
						const sessionId = `${tabId}-${Date.now()}`;

						// Create a promise that will be resolved when release() is called
						let releaseCallback: (() => void) | null = null;
						const releasePromise = new Promise<void>((releaseResolve) => {
							releaseCallback = releaseResolve;
						});

						const session: LeadershipSession = {
							sessionId,
							async release() {
								releaseCallback?.();
							},
							async renew() {
								// No-op for Web Locks - lock is held until release
							},
						};

						resolve(session);

						// Hold the lock until release() is called
						// The lock is automatically released when this callback resolves
						await releasePromise;
					})
					.catch(() => {
						// Web Locks threw - return null (caller should fall back to lease)
						resolve(null);
					});
			});
		},
	};
}

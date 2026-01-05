/**
 * OutboxProvider - Bootstraps the outbox system and provides context to consumers.
 *
 * Responsibilities:
 * - Initialize outbox instance scoped to the authenticated user
 * - Run sender loop when this tab is the leader
 * - Subscribe to broadcasts for cross-tab coordination
 * - Expose counts and operations via React context
 * - Show "Batch ready" toast on successful sends (T12)
 */

import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth';
import { batchKeys } from '@/features/batch/api/get-batch';
import {
	createLeadershipProvider,
	createOutbox,
	deleteOutboxDatabase,
	generateTabId,
	type LeadershipProvider,
	type OutboxBroadcastMessage,
	type OutboxCounts,
	type OutboxInstance,
	type OutboxStatus,
} from '@/lib/outbox';
import { queryClient } from '@/lib/query-client';
import { OutboxContext } from '../hooks/use-outbox';
import type { OutboxContextValue } from '../types';

// Session storage key for tab ID (persists across page refreshes)
const TAB_ID_KEY = 'outbox_tab_id';

// Default counts when not initialized
const DEFAULT_COUNTS: OutboxCounts = { pending: 0, failed: 0, blocked_auth: 0 };

interface OutboxProviderProps {
	children: React.ReactNode;
}

/**
 * Get or create a stable tab ID for this browser tab.
 * Stored in sessionStorage to survive page refreshes but not new tabs.
 */
function getTabId(): string {
	let tabId = sessionStorage.getItem(TAB_ID_KEY);
	if (!tabId) {
		tabId = generateTabId();
		sessionStorage.setItem(TAB_ID_KEY, tabId);
	}
	return tabId;
}

export function OutboxProvider({ children }: OutboxProviderProps) {
	const { data: session } = useAuth();
	const userId = session?.user?.id;

	// Reactive state
	const [counts, setCounts] = useState<OutboxCounts>(DEFAULT_COUNTS);
	const [isReady, setIsReady] = useState(false);

	// Refs for StrictMode-safe initialization (avoid double-init)
	const outboxRef = useRef<OutboxInstance | null>(null);
	const leadershipRef = useRef<LeadershipProvider | null>(null);
	const cleanupRef = useRef<(() => void) | null>(null);
	const initUserScopeRef = useRef<string | null>(null);

	// Refresh counts from store
	const refreshCounts = useCallback(async () => {
		if (!outboxRef.current || !initUserScopeRef.current) return;
		try {
			const newCounts = await outboxRef.current.store.countByStatus(initUserScopeRef.current);
			setCounts(newCounts);
		} catch {
			// Ignore errors during refresh
		}
	}, []);

	// Initialize/reinitialize when user changes
	useEffect(() => {
		// Skip if no user (sign-out or not authenticated)
		if (!userId) {
			// Clean up if was initialized (user signed out)
			const oldUserScope = initUserScopeRef.current;
			if (oldUserScope) {
				// Clean up refs and state first
				if (cleanupRef.current) {
					cleanupRef.current();
					cleanupRef.current = null;
				}
				outboxRef.current = null;
				leadershipRef.current = null;
				initUserScopeRef.current = null;

				// Delete the database to prevent data leakage on shared devices
				// Fire and forget - don't block on this
				deleteOutboxDatabase(oldUserScope).catch(() => {
					// Ignore errors (e.g., database blocked by another tab)
				});
			}
			setCounts(DEFAULT_COUNTS);
			setIsReady(false);
			return;
		}

		// Skip if already initialized for this user
		if (initUserScopeRef.current === userId && outboxRef.current) {
			return;
		}

		// Clean up previous initialization if switching users
		if (cleanupRef.current) {
			cleanupRef.current();
			cleanupRef.current = null;
		}

		// Initialize
		const tabId = getTabId();
		const userScope = userId;
		initUserScopeRef.current = userScope;

		const clock = { now: () => Date.now() };

		// Create outbox instance
		const outbox = createOutbox({
			userScope,
			clock,
			onAuthBlocked: () => {
				// Could show a toast or trigger sign-in prompt
				toast.warning('Sign-in required to sync');
			},
		});
		outboxRef.current = outbox;

		// Create leadership provider
		const leadership = createLeadershipProvider({
			clock,
			tabId,
			userScope,
		});
		leadershipRef.current = leadership;

		// Track if component is still mounted
		let isMounted = true;
		let senderLoopTimeoutId: ReturnType<typeof setTimeout> | null = null;

		// Sender loop runner - only runs when leader
		async function runSenderLoop() {
			if (!isMounted || !outboxRef.current || !leadershipRef.current) return;

			const session = await leadershipRef.current.tryAcquire();
			if (!session) {
				// Not leader, try again later
				senderLoopTimeoutId = setTimeout(runSenderLoop, 5000);
				return;
			}

			try {
				let hasMore = true;
				while (hasMore && isMounted) {
					hasMore = await outboxRef.current.senderLoop.processOnce();
					if (hasMore) {
						// Renew lease between iterations
						await session.renew();
					}
				}

				// Schedule next run based on next due time
				if (isMounted) {
					const nextDue = await outboxRef.current.senderLoop.getNextDueTime();
					if (nextDue) {
						const delay = Math.max(100, nextDue - Date.now());
						senderLoopTimeoutId = setTimeout(runSenderLoop, delay);
					} else {
						// No pending items, check again in 5s
						senderLoopTimeoutId = setTimeout(runSenderLoop, 5000);
					}
				}
			} finally {
				await session.release();
			}
		}

		// Handle broadcast messages
		function handleBroadcast(msg: OutboxBroadcastMessage) {
			if (!isMounted) return;

			switch (msg.type) {
				case 'kick':
					// Wake sender loop immediately
					if (senderLoopTimeoutId) {
						clearTimeout(senderLoopTimeoutId);
						senderLoopTimeoutId = null;
					}
					runSenderLoop();
					break;

				case 'outbox_changed':
					// Refresh counts if it's for our user
					if (msg.userScope === userScope) {
						refreshCounts();
					}
					break;

				case 'outbox_result':
					// T12: Show "Batch ready" toast on successful send
					if (msg.userScope === userScope) {
						// Invalidate batch queries
						queryClient.invalidateQueries({ queryKey: batchKeys.lists() });

						// Show toast with Open action
						toast.success('Batch ready', {
							action: {
								label: 'Open',
								onClick: () => {
									window.location.href = `/batch/${msg.result.batchId}`;
								},
							},
						});
					}
					break;
			}
		}

		// Subscribe to broadcasts
		const unsubscribe = outbox.broadcast.subscribe(handleBroadcast);

		// Initial counts load and resume any auth-blocked items
		// (covers both initial load with session and sign-in after sign-out)
		Promise.all([
			refreshCounts(),
			outbox.store.resumeBlockedAuth(userScope, clock.now()).then((count) => {
				if (count > 0 && isMounted) {
					// Items were resumed - refresh counts and kick sender
					refreshCounts();
					outbox.broadcast.publish({ type: 'kick' });
				}
			}),
		]).then(() => {
			if (isMounted) {
				setIsReady(true);
			}
		});

		// Start sender loop
		runSenderLoop();

		// Store cleanup function
		cleanupRef.current = () => {
			isMounted = false;
			if (senderLoopTimeoutId) {
				clearTimeout(senderLoopTimeoutId);
			}
			unsubscribe();
		};

		// Return cleanup for useEffect
		return () => {
			if (cleanupRef.current) {
				cleanupRef.current();
				cleanupRef.current = null;
			}
		};
	}, [userId, refreshCounts]);

	// Context value
	const contextValue = useMemo<OutboxContextValue | null>(() => {
		if (!outboxRef.current || !initUserScopeRef.current) {
			return null;
		}

		const outbox = outboxRef.current;
		const userScope = initUserScopeRef.current;

		return {
			enqueue: outbox.enqueue,
			undo: outbox.undo,
			counts,
			isReady,
			listByStatus: (status: OutboxStatus) => outbox.store.listByStatus(userScope, status),
			discardItem: async (itemId: string) => {
				await outbox.store.delete(itemId);
				outbox.broadcast.publish({ type: 'outbox_changed', userScope });
			},
		};
	}, [counts, isReady]);

	return <OutboxContext.Provider value={contextValue}>{children}</OutboxContext.Provider>;
}

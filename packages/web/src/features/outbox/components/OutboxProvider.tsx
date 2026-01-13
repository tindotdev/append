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
import type { AuthContextType } from '@/features/auth/hooks/use-auth';
import { batchKeys } from '@/features/batch/api/get-batch';
import {
	createAppOutbox,
	createLeadershipProvider,
	deleteOutboxDatabase,
	generateTabId,
	type LeadershipProvider,
	type OutboxBroadcastMessage,
	type OutboxBroadcastResult,
	type OutboxCounts,
	type OutboxStatus,
} from '@/lib/outbox-adapter';
import { queryClient } from '@/lib/query-client';
import { OutboxContext } from '../hooks/use-outbox';
import type { OutboxContextValue } from '../types';

// Session storage key for tab ID (persists across page refreshes)
const TAB_ID_KEY = 'outbox_tab_id';

// Sender loop poll interval when idle or not leader
const SENDER_POLL_INTERVAL_MS = 5_000;

// Debounce refresh to reduce cross-tab churn
const REFRESH_DEBOUNCE_MS = 500;

// Rate limit error toasts to avoid spam during transient network issues
const ERROR_TOAST_RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

// Default counts when not initialized
const DEFAULT_COUNTS: OutboxCounts = { pending: 0, failed: 0, blocked_auth: 0 };

// Batch IDs are UUID v4s; avoid navigation if format is unexpected
const BATCH_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// In-memory fallback for tab ID when sessionStorage is unavailable
let inMemoryTabId: string | null = null;

// Type for the outbox instance returned by createAppOutbox
type AppOutboxInstance = ReturnType<typeof createAppOutbox>;

interface OutboxProviderProps {
	children: React.ReactNode;
}

/**
 * Get or create a stable tab ID for this browser tab.
 * Stored in sessionStorage to survive page refreshes but not new tabs.
 * Falls back to in-memory storage if sessionStorage is unavailable
 * (Safari private mode, storage disabled contexts, etc.)
 */
function getTabId(): string {
	try {
		const existingTabId = sessionStorage.getItem(TAB_ID_KEY);
		if (existingTabId) {
			return existingTabId;
		}
		const newTabId = generateTabId();
		sessionStorage.setItem(TAB_ID_KEY, newTabId);
		return newTabId;
	} catch {
		// Storage unavailable - use in-memory fallback (won't survive refresh)
		if (!inMemoryTabId) {
			inMemoryTabId = generateTabId();
		}
		return inMemoryTabId as string;
	}
}

type AuthSession = AuthContextType['data'];

function getAuthSessionKey(session: AuthSession | null | undefined): string | null {
	if (!session) return null;

	const parts: string[] = [];

	if (session.user?.id) {
		parts.push(`user:${session.user.id}`);
	}

	if (session.session?.id) {
		parts.push(`sid:${session.session.id}`);
	}

	if (session.session?.expiresAt) {
		parts.push(`exp:${session.session.expiresAt}`);
	} else if ('expiresAt' in session && session.expiresAt) {
		parts.push(`exp:${session.expiresAt}`);
	}

	if (session.session?.updatedAt) {
		parts.push(`upd:${session.session.updatedAt}`);
	}

	return parts.length > 0 ? parts.join('|') : null;
}

export function OutboxProvider({ children }: OutboxProviderProps) {
	const { data: session } = useAuth();
	const userId = session?.user?.id;

	// Reactive state
	const [counts, setCounts] = useState<OutboxCounts>(DEFAULT_COUNTS);
	const [isReady, setIsReady] = useState(false);

	// Refs for StrictMode-safe initialization (avoid double-init)
	const outboxRef = useRef<AppOutboxInstance | null>(null);
	const leadershipRef = useRef<LeadershipProvider | null>(null);
	const cleanupRef = useRef<(() => void) | null>(null);
	const initUserScopeRef = useRef<string | null>(null);
	const lastAuthSessionKeyRef = useRef<string | null>(null);
	const lastUserIdRef = useRef<string | null>(null);
	const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isMountedRef = useRef(true);
	const refreshCountsSequenceRef = useRef(0);
	const resumeBlockedAuthSequenceRef = useRef(0);
	const lastSenderErrorToastRef = useRef<number>(0);
	const lastCountRefreshErrorToastRef = useRef<number>(0);
	const lastResumeAuthErrorToastRef = useRef<number>(0);
	const authSessionKey = useMemo(() => getAuthSessionKey(session), [session]);

	// Refresh counts from store
	const refreshCounts = useCallback(async () => {
		if (!isMountedRef.current || !outboxRef.current || !initUserScopeRef.current) return;
		const sequence = ++refreshCountsSequenceRef.current;
		try {
			const newCounts = await outboxRef.current.store.countByStatus(initUserScopeRef.current);
			if (isMountedRef.current && sequence === refreshCountsSequenceRef.current) {
				setCounts(newCounts);
			}
		} catch (err) {
			console.warn('[Outbox] Failed to refresh counts:', err);

			// Show rate-limited toast to notify user that sync status may be stale
			const now = Date.now();
			if (now - lastCountRefreshErrorToastRef.current > ERROR_TOAST_RATE_LIMIT_MS) {
				lastCountRefreshErrorToastRef.current = now;
				toast.warning('Unable to refresh sync status. Counts may be stale.');
			}
		}
	}, []);

	const refreshCountsDebounced = useCallback(() => {
		if (refreshTimeoutRef.current) return;
		refreshTimeoutRef.current = setTimeout(() => {
			refreshTimeoutRef.current = null;
			refreshCounts();
		}, REFRESH_DEBOUNCE_MS);
	}, [refreshCounts]);

	// Initialize/reinitialize when user changes
	useEffect(() => {
		isMountedRef.current = true;
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
				// Close the store to release IndexedDB connection (prevents memory leak)
				outboxRef.current?.store.close();
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

		// Create outbox instance using the app adapter
		const outbox = createAppOutbox({
			userScope,
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
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestrates leadership, retries, scheduling, and cleanup
		async function runSenderLoop() {
			if (!isMounted || !outboxRef.current || !leadershipRef.current) return;

			let session: Awaited<ReturnType<LeadershipProvider['tryAcquire']>> = null;
			try {
				session = await leadershipRef.current.tryAcquire();
				if (!session) {
					// Not leader, try again later
					senderLoopTimeoutId = setTimeout(runSenderLoop, SENDER_POLL_INTERVAL_MS);
					return;
				}

				let hasMore = true;
				while (hasMore && isMounted) {
					hasMore = await outboxRef.current.senderLoop.processOnce();
					if (!isMounted) break;
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
						senderLoopTimeoutId = setTimeout(runSenderLoop, SENDER_POLL_INTERVAL_MS);
					}
				}
			} catch (error) {
				console.warn('Outbox sender loop failed; retrying soon.', error);

				// Show rate-limited toast to notify user of sync issues
				const now = Date.now();
				if (now - lastSenderErrorToastRef.current > ERROR_TOAST_RATE_LIMIT_MS) {
					lastSenderErrorToastRef.current = now;
					toast.error('Sync temporarily unavailable. Retrying automatically.');
				}

				if (isMounted) {
					senderLoopTimeoutId = setTimeout(runSenderLoop, SENDER_POLL_INTERVAL_MS);
				}
			} finally {
				if (session) {
					try {
						await session.release();
					} catch (error) {
						console.warn('Failed to release outbox leadership session.', error);
					}
				}
			}
		}

		// Handle broadcast messages
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: broadcast handler is a small switch-based router
		function handleBroadcast(msg: OutboxBroadcastMessage<OutboxBroadcastResult>) {
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
						refreshCountsDebounced();
					}
					break;

				case 'outbox_result': {
					// T12: Show "Batch ready" toast on successful send
					if (msg.userScope === userScope) {
						// Invalidate batch queries
						queryClient.invalidateQueries({ queryKey: batchKeys.lists() });

						// Show toast with Open action (msg.result is now properly typed as OutboxBroadcastResult)
						const batchId = msg.result.batchId;
						const isSafeBatchId = batchId && BATCH_ID_PATTERN.test(batchId);
						if (batchId && !isSafeBatchId) {
							console.warn('[Outbox] Ignoring invalid batchId in outbox_result:', batchId);
						}

						toast.success('Batch ready', {
							action: isSafeBatchId
								? {
										label: 'Open',
										onClick: () => {
											void import('@/router').then(({ router }) => router.navigate({ to: '/batch/$batchId', params: { batchId } }));
										},
									}
								: undefined,
						});
					}
					break;
				}
			}
		}

		// Subscribe to broadcasts
		const unsubscribe = outbox.broadcast.subscribe(handleBroadcast);

		// Initial counts load and resume any auth-blocked items
		// (covers both initial load with session and sign-in after sign-out)
		Promise.all([
			refreshCounts(),
			outbox.store.resumeBlockedAuth(userScope, clock.now()).then((count: number) => {
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
			isMountedRef.current = false;
			if (senderLoopTimeoutId) {
				clearTimeout(senderLoopTimeoutId);
			}
			if (refreshTimeoutRef.current) {
				clearTimeout(refreshTimeoutRef.current);
				refreshTimeoutRef.current = null;
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
	}, [userId, refreshCounts, refreshCountsDebounced]);

	// Resume auth-blocked items when auth state changes for the same user
	useEffect(() => {
		if (!userId || !outboxRef.current || !initUserScopeRef.current) {
			lastUserIdRef.current = userId ?? null;
			lastAuthSessionKeyRef.current = authSessionKey;
			return;
		}

		if (lastUserIdRef.current !== userId) {
			lastUserIdRef.current = userId;
			lastAuthSessionKeyRef.current = authSessionKey;
			return;
		}

		if (authSessionKey && lastAuthSessionKeyRef.current && authSessionKey !== lastAuthSessionKeyRef.current) {
			const sequence = ++resumeBlockedAuthSequenceRef.current;
			outboxRef.current.store
				.resumeBlockedAuth(userId, Date.now())
				.then((count: number) => {
					if (sequence !== resumeBlockedAuthSequenceRef.current || !isMountedRef.current) {
						return;
					}
					if (count > 0) {
						refreshCounts();
						outboxRef.current?.broadcast.publish({ type: 'kick' });
					}
				})
				.catch((err) => {
					console.warn('[Outbox] Failed to resume blocked auth items:', err);

					// Show rate-limited toast to notify user of auth recovery failure
					const now = Date.now();
					if (now - lastResumeAuthErrorToastRef.current > ERROR_TOAST_RATE_LIMIT_MS) {
						lastResumeAuthErrorToastRef.current = now;
						toast.warning('Unable to resume pending syncs. Please try again later.');
					}
				});
		}

		lastAuthSessionKeyRef.current = authSessionKey;
	}, [authSessionKey, refreshCounts, userId]);

	// Prevent browser close when items are pending sync
	useEffect(() => {
		if (!isReady || counts.pending === 0) return;

		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = '';
		};

		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
		};
	}, [isReady, counts.pending]);

	const enqueue = useCallback((options: { terms: string }) => {
		const outbox = outboxRef.current;
		if (!outbox) return Promise.reject(new Error('Outbox not initialized'));
		return outbox.enqueue(options);
	}, []);

	const undo = useCallback((itemId: string) => {
		const outbox = outboxRef.current;
		if (!outbox) return Promise.reject(new Error('Outbox not initialized'));
		return outbox.undo(itemId);
	}, []);

	const listByStatus = useCallback((status: OutboxStatus) => {
		const outbox = outboxRef.current;
		const userScope = initUserScopeRef.current;
		if (!outbox || !userScope) return Promise.reject(new Error('Outbox not initialized'));
		return outbox.store.listByStatus(userScope, status);
	}, []);

	const discardItem = useCallback(async (itemId: string) => {
		const outbox = outboxRef.current;
		const userScope = initUserScopeRef.current;
		if (!outbox || !userScope) throw new Error('Outbox not initialized');
		await outbox.store.delete(itemId);
		outbox.broadcast.publish({ type: 'outbox_changed', userScope });
	}, []);

	// Context value
	const contextValue = useMemo<OutboxContextValue | null>(() => {
		if (!outboxRef.current || !initUserScopeRef.current) {
			return null;
		}

		return {
			enqueue,
			undo,
			counts,
			isReady,
			listByStatus,
			discardItem,
		};
	}, [counts, discardItem, enqueue, isReady, listByStatus, undo]);

	return <OutboxContext.Provider value={contextValue}>{children}</OutboxContext.Provider>;
}

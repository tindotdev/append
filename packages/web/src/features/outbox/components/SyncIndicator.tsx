/**
 * SyncIndicator - Header chip showing sync status.
 *
 * States:
 * - Syncing (yellow): pending items being sent
 * - Needs Attention (red): failed or auth-blocked items
 * - Offline (gray): browser is offline
 * - Hidden: no pending/failed items and online
 */

import { AlertCircle, Loader2, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useOutboxCounts } from '../hooks/use-outbox';

interface SyncIndicatorProps {
	/** Callback when clicked (opens management UI) */
	onManageClick?: () => void;
}

export function SyncIndicator({ onManageClick }: SyncIndicatorProps) {
	// Use the safe hook that won't throw during initialization
	const { counts, isReady } = useOutboxCounts();
	const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

	// Listen for online/offline events
	useEffect(() => {
		function handleOnline() {
			setIsOnline(true);
		}
		function handleOffline() {
			setIsOnline(false);
		}

		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	}, []);

	// Don't render until ready
	if (!isReady) {
		return null;
	}

	const issueCount = counts.failed + counts.blocked_auth;
	const hasIssues = issueCount > 0;
	const isSyncing = counts.pending > 0;

	// Determine what to show
	if (!isOnline) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Badge variant="secondary" className="cursor-default gap-1.5">
						<WifiOff className="h-3 w-3" />
						<span>Offline</span>
					</Badge>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<p>You're offline. Changes will sync when connected.</p>
				</TooltipContent>
			</Tooltip>
		);
	}

	if (hasIssues) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Badge variant="destructive" className="cursor-pointer gap-1.5" onClick={onManageClick}>
						<AlertCircle className="h-3 w-3" />
						<span>
							{issueCount} {issueCount === 1 ? 'issue' : 'issues'}
						</span>
					</Badge>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<div className="space-y-1">
						{counts.failed > 0 && (
							<p>
								{counts.failed} failed {counts.failed === 1 ? 'item' : 'items'}
							</p>
						)}
						{counts.blocked_auth > 0 && <p>{counts.blocked_auth} waiting for sign-in</p>}
						<p className="text-xs text-muted-foreground">Click to manage</p>
					</div>
				</TooltipContent>
			</Tooltip>
		);
	}

	if (isSyncing) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Badge variant="warning" className="cursor-default gap-1.5">
						<Loader2 className="h-3 w-3 animate-spin" />
						<span>Syncing {counts.pending}</span>
					</Badge>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<p>
						{counts.pending} {counts.pending === 1 ? 'item' : 'items'} syncing...
					</p>
				</TooltipContent>
			</Tooltip>
		);
	}

	// No pending, no issues, online - don't show anything
	return null;
}

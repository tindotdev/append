/**
 * OutboxManagement - Dialog for managing failed and auth-blocked outbox items.
 *
 * Features:
 * - Shows auth-blocked items with sign-in prompt
 * - Shows failed items with error messages and discard action
 * - Refreshes on open and after actions
 */

import { useNavigate } from '@tanstack/react-router';
import { AlertCircle, LogIn, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useOutboxSafe } from '../hooks/use-outbox';
import type { OutboxItem } from '../types';

interface OutboxManagementProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function OutboxManagement({ open, onOpenChange }: OutboxManagementProps) {
	const outbox = useOutboxSafe();
	const navigate = useNavigate();
	const [failedItems, setFailedItems] = useState<OutboxItem[]>([]);
	const [blockedItems, setBlockedItems] = useState<OutboxItem[]>([]);
	const [isLoading, setIsLoading] = useState(false);

	// Refresh items from store
	const refreshItems = useCallback(async () => {
		if (!outbox) return;
		setIsLoading(true);
		try {
			const [failed, blocked] = await Promise.all([outbox.listByStatus('failed'), outbox.listByStatus('blocked_auth')]);
			setFailedItems(failed);
			setBlockedItems(blocked);
		} catch (error) {
			console.error('Failed to load outbox items:', error);
			toast.error('Failed to load sync issues. Please try again.');
		} finally {
			setIsLoading(false);
		}
	}, [outbox]);

	// Refresh when opened or counts change (counts triggers refresh after discard)
	// biome-ignore lint/correctness/useExhaustiveDependencies: counts is used to trigger refresh
	useEffect(() => {
		if (open && outbox) {
			refreshItems();
		}
	}, [open, outbox?.counts, refreshItems]);

	// Handle discard
	const handleDiscard = async (itemId: string) => {
		if (!outbox) return;
		if (!window.confirm('Permanently discard this item? This cannot be undone.')) return;
		await outbox.discardItem(itemId);
		// Item will be removed from list via counts change triggering refresh
	};

	// Don't render dialog content if outbox not ready
	if (!outbox) {
		return (
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Sync Issues</DialogTitle>
						<DialogDescription>Loading...</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		);
	}

	// Handle sign in redirect
	const handleSignIn = () => {
		onOpenChange(false);
		navigate({ to: '/sign-in' });
	};

	// Truncate terms for display
	const truncateTerms = (terms: string, maxLength = 80) => {
		const firstLine = terms.split('\n')[0];
		if (firstLine.length <= maxLength) return firstLine;
		return `${firstLine.slice(0, maxLength)}...`;
	};

	const hasIssues = failedItems.length > 0 || blockedItems.length > 0;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<AlertCircle className="h-5 w-5 text-destructive" />
						Sync Issues
					</DialogTitle>
					<DialogDescription>
						{hasIssues ? 'Some items could not be synced. Review and resolve below.' : 'All items synced successfully.'}
					</DialogDescription>
				</DialogHeader>

				{isLoading ? (
					<div className="py-4 text-center text-sm text-muted-foreground">Loading...</div>
				) : (
					<div className="space-y-4">
						{/* Auth-blocked section */}
						{blockedItems.length > 0 && (
							<section className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
								<h3 className="flex items-center gap-2 text-sm font-medium text-blue-300">
									<LogIn className="h-4 w-4" />
									Sign-in Required
								</h3>
								<p className="mt-1 text-sm text-muted-foreground">
									{blockedItems.length} {blockedItems.length === 1 ? 'item is' : 'items are'} waiting for you to sign in.
								</p>
								<Button variant="secondary" size="sm" className="mt-3" onClick={handleSignIn}>
									<LogIn className="mr-2 h-4 w-4" />
									Sign In
								</Button>
							</section>
						)}

						{/* Failed items */}
						{failedItems.length > 0 && (
							<section className="space-y-2">
								<h3 className="text-sm font-medium text-destructive">Failed Items ({failedItems.length})</h3>
								<div className="space-y-2">
									{failedItems.map((item) => (
										<div
											key={item.id}
											className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3"
										>
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm">{truncateTerms(item.command.request.terms)}</p>
												{item.lastError && <p className="mt-1 text-xs text-destructive">{item.lastError.message}</p>}
											</div>
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/20 hover:text-destructive"
												onClick={() => handleDiscard(item.id)}
												title="Discard"
												aria-label="Discard item"
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									))}
								</div>
							</section>
						)}

						{/* No issues */}
						{!hasIssues && <div className="py-4 text-center text-sm text-muted-foreground">No sync issues at this time.</div>}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

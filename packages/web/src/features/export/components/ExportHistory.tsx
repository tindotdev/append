/**
 * Export history list component.
 */

import { useQuery } from '@tanstack/react-query';
import { Download, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { type ExportHistoryItem, getExportHistory } from '../api/get-export-history';

function formatRelativeTime(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMinutes = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMinutes < 1) return 'just now';
	if (diffMinutes < 60) return `${diffMinutes}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;

	return date.toLocaleDateString();
}

function ExportHistoryItemRow({ item }: { item: ExportHistoryItem }) {
	return (
		<div className="py-3 border-b border-border last:border-0">
			<div className="flex items-start justify-between gap-4">
				<div className="flex items-start gap-3 min-w-0 flex-1">
					<Download className="size-4 text-muted-foreground mt-0.5" />
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<span className="text-sm font-medium text-foreground">{item.bucketName}</span>
							<span className="text-xs text-muted-foreground">({item.entryCount} terms)</span>
						</div>
						<div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
							<FileText className="size-3" />
							<span>{item.filename}</span>
						</div>
					</div>
				</div>
				<span className="text-xs text-muted-foreground whitespace-nowrap">{formatRelativeTime(item.createdAt)}</span>
			</div>
		</div>
	);
}

function ExportHistorySkeleton() {
	return (
		<div className="space-y-3">
			{[1, 2, 3].map((i) => (
				<div key={i} className="flex items-center gap-3 py-3">
					<Skeleton className="size-4" />
					<div className="flex-1 space-y-2">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-3 w-24" />
					</div>
					<Skeleton className="h-3 w-16" />
				</div>
			))}
		</div>
	);
}

export function ExportHistory() {
	const { data, isLoading, error } = useQuery({
		queryKey: ['export-history'],
		queryFn: () => getExportHistory(10),
		staleTime: 30000, // 30 seconds
	});

	if (isLoading) {
		return (
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-sm">Recent Exports</CardTitle>
				</CardHeader>
				<CardContent>
					<ExportHistorySkeleton />
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-sm">Recent Exports</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">Failed to load export history.</p>
				</CardContent>
			</Card>
		);
	}

	if (!data || data.items.length === 0) {
		return (
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-sm">Recent Exports</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">No exports yet. Download a bucket to see your export history.</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-sm">Recent Exports</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="divide-y divide-border">
					{data.items.map((item) => (
						<ExportHistoryItemRow key={item.id} item={item} />
					))}
				</div>
				{data.hasMore && <p className="text-xs text-muted-foreground text-center mt-3">Showing last {data.items.length} exports</p>}
			</CardContent>
		</Card>
	);
}

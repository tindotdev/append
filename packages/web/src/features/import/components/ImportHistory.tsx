/**
 * Import history list component.
 */

import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Clock, FileText, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelativeTime } from '@/lib/format-relative-time';
import { getImportHistory, type ImportHistoryItem } from '../api/get-import-history';

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function StatusIcon({ status }: { status: ImportHistoryItem['status'] }) {
	switch (status) {
		case 'done':
			return <CheckCircle className="size-4 text-green-500" />;
		case 'error':
			return <XCircle className="size-4 text-red-500" />;
		default:
			return <Clock className="size-4 text-yellow-500" />;
	}
}

function ImportHistoryItemRow({ item }: { item: ImportHistoryItem }) {
	const totalFiles = item.files.length;
	const totalSize = item.files.reduce((sum, f) => sum + f.size, 0);

	return (
		<div className="py-3 border-b border-border last:border-0">
			<div className="flex items-start justify-between gap-4">
				<div className="flex items-start gap-3 min-w-0 flex-1">
					<StatusIcon status={item.status} />
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<span className="text-sm font-medium text-foreground">
								{item.termCreatedCount} terms, {item.termSenseCreatedCount} senses
							</span>
							{item.flaggedCount > 0 && <span className="text-xs text-yellow-500">{item.flaggedCount} flagged</span>}
						</div>
						<div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
							<FileText className="size-3" />
							<span>
								{totalFiles} file{totalFiles !== 1 ? 's' : ''} ({formatFileSize(totalSize)})
							</span>
						</div>
						{item.files.length > 0 && (
							<div className="mt-1 text-xs text-muted-foreground truncate">{item.files.map((f) => f.filename).join(', ')}</div>
						)}
					</div>
				</div>
				<span className="text-xs text-muted-foreground whitespace-nowrap">{formatRelativeTime(item.createdAt)}</span>
			</div>
		</div>
	);
}

function ImportHistorySkeleton() {
	return (
		<div className="space-y-3">
			{[1, 2, 3].map((i) => (
				<div key={i} className="flex items-center gap-3 py-3">
					<Skeleton className="size-4 rounded-full" />
					<div className="flex-1 space-y-2">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-3 w-48" />
					</div>
					<Skeleton className="h-3 w-16" />
				</div>
			))}
		</div>
	);
}

export function ImportHistory() {
	const { data, isLoading, error } = useQuery({
		queryKey: ['import-history'],
		queryFn: () => getImportHistory(10),
		staleTime: 30000, // 30 seconds
	});

	if (isLoading) {
		return (
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-sm">Recent Imports</CardTitle>
				</CardHeader>
				<CardContent>
					<ImportHistorySkeleton />
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-sm">Recent Imports</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">Failed to load import history.</p>
				</CardContent>
			</Card>
		);
	}

	if (!data || data.items.length === 0) {
		return (
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-sm">Recent Imports</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">No imports yet. Upload some markdown files to get started.</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-sm">Recent Imports</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="divide-y divide-border">
					{data.items.map((item) => (
						<ImportHistoryItemRow key={item.id} item={item} />
					))}
				</div>
				{data.hasMore && <p className="text-xs text-muted-foreground text-center mt-3">Showing last {data.items.length} imports</p>}
			</CardContent>
		</Card>
	);
}

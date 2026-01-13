/**
 * Export history list component.
 */

import { useQuery } from '@tanstack/react-query';
import { Download, FileText, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelativeTime } from '@/lib/format-relative-time';
import { type ExportHistoryItem, getExportHistory } from '../api/get-export-history';

interface ExportHistoryItemRowProps {
	item: ExportHistoryItem;
	onClick?: (item: ExportHistoryItem) => void;
}

function ExportHistoryItemRow({ item, onClick }: ExportHistoryItemRowProps) {
	const handleClick = () => onClick?.(item);

	return (
		<Button
			variant="ghost"
			className="w-full h-auto text-left py-3 border-b border-border last:border-0 justify-start rounded-sm px-2 -mx-2 font-normal"
			onClick={handleClick}
		>
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
		</Button>
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
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ['export-history'],
		queryFn: () => getExportHistory(10),
		staleTime: 30000, // 30 seconds
	});

	if (isLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Export History</CardTitle>
					<CardDescription>View past exports and re-download files.</CardDescription>
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
				<CardHeader>
					<CardTitle>Export History</CardTitle>
					<CardDescription>View past exports and re-download files.</CardDescription>
				</CardHeader>
				<CardContent>
					<Alert variant="destructive" className="mb-4">
						<XCircle className="size-4" />
						<AlertTitle>Error</AlertTitle>
						<AlertDescription>Failed to load export history.</AlertDescription>
					</Alert>
					<Button variant="secondary" onClick={() => refetch()} className="w-full">
						Retry
					</Button>
				</CardContent>
			</Card>
		);
	}

	if (!data || data.items.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Export History</CardTitle>
					<CardDescription>View past exports and re-download files.</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">No exports yet. Download a bucket to see your export history.</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Export History</CardTitle>
				<CardDescription>View past exports and re-download files.</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="divide-y divide-border">
					{data.items.map((item) => (
						<ExportHistoryItemRow key={item.id} item={item} onClick={(item) => console.log('Export history item clicked:', item)} />
					))}
				</div>
				{data.hasMore && <p className="text-xs text-muted-foreground text-center mt-3">Showing last {data.items.length} exports</p>}
			</CardContent>
		</Card>
	);
}

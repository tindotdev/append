import { Link } from '@tanstack/react-router';
import { Bookmark } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { useTodayCapturesData } from '../hooks/use-dashboard-data';
import type { CaptureItem, CaptureType } from '../types';

const CAPTURE_TYPE_LABELS: Record<CaptureType, string> = {
	term: 'term',
	question: 'question',
	note: 'note',
	snippet: 'snippet',
};

interface CaptureListItemProps {
	item: CaptureItem;
}

function CaptureListItem({ item }: CaptureListItemProps) {
	return (
		<div className="flex items-start gap-2 py-1">
			<Badge variant="outline" className="mt-0.5 shrink-0 px-1.5 py-0 text-[10px] text-zinc-500">
				{CAPTURE_TYPE_LABELS[item.type]}
			</Badge>
			<div className="min-w-0 flex-1">
				<p className="truncate text-[13px] text-zinc-300">{item.label}</p>
				<p className="truncate text-[11px] text-zinc-600">{item.source}</p>
			</div>
		</div>
	);
}

function TodayCapturesListSkeleton() {
	return (
		<Card className="@container/card gap-2 py-4">
			<CardHeader className="gap-1 px-4">
				<Skeleton className="h-3 w-20" />
				<Skeleton className="h-5 w-8" />
			</CardHeader>
			<CardContent className="space-y-2 px-4">
				<div className="flex items-start gap-2">
					<Skeleton className="h-4 w-12" />
					<div className="flex-1 space-y-1">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-3 w-24" />
					</div>
				</div>
				<div className="flex items-start gap-2">
					<Skeleton className="h-4 w-12" />
					<div className="flex-1 space-y-1">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-3 w-24" />
					</div>
				</div>
				<div className="flex items-start gap-2">
					<Skeleton className="h-4 w-12" />
					<div className="flex-1 space-y-1">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-3 w-24" />
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export function TodayCapturesList() {
	const { data, isLoading, isEmpty } = useTodayCapturesData();

	if (isLoading) {
		return <TodayCapturesListSkeleton />;
	}

	if (isEmpty) {
		return (
			<Card className="@container/card gap-2 py-4">
				<Empty className="px-4">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Bookmark className="size-4" />
						</EmptyMedia>
						<EmptyTitle className="text-sm">No captures today</EmptyTitle>
						<EmptyDescription className="text-xs">Capture terms, questions, and notes as you learn</EmptyDescription>
					</EmptyHeader>
					<Button variant="outline" size="sm" asChild>
						<Link to="/batch/new">Start capturing</Link>
					</Button>
				</Empty>
			</Card>
		);
	}

	const displayItems = data.items.slice(0, 5);

	return (
		<Card className="@container/card gap-2 py-4">
			<CardHeader className="gap-1 px-4">
				<CardDescription className="text-xs">Captures today</CardDescription>
				<CardTitle className="text-lg tabular-nums">{data.count}</CardTitle>
				<CardAction>
					<Bookmark className="size-4 text-zinc-500" />
				</CardAction>
			</CardHeader>
			<CardContent className="px-4">
				<div className="space-y-0.5">
					{displayItems.map((item) => (
						<CaptureListItem key={item.id} item={item} />
					))}
				</div>
			</CardContent>
		</Card>
	);
}

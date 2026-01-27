import { List } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useTodayBreakdownData } from '../hooks/use-dashboard-data';
import type { BreakdownItem } from '../types';
import { BreakdownDrawer } from './BreakdownDrawer';

type View = 'topic' | 'source';

function formatTime(minutes: number): string {
	if (minutes < 60) return `${Math.round(minutes)}m`;
	const hours = Math.floor(minutes / 60);
	const mins = Math.round(minutes % 60);
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

interface BarListItemProps {
	item: BreakdownItem;
	maxMinutes: number;
}

function BarListItem({ item, maxMinutes }: BarListItemProps) {
	const percentage = (item.minutes / maxMinutes) * 100;

	return (
		<div className="group relative flex items-center gap-3 px-2 py-1">
			{/* Background bar */}
			<div className="absolute inset-y-0 left-0 right-0 overflow-hidden rounded">
				<div className="h-full bg-emerald-400/10 transition-all group-hover:bg-emerald-400/15" style={{ width: `${percentage}%` }} />
			</div>
			{/* Content */}
			<span className="relative z-10 flex-1 truncate text-[13px] text-card-foreground">{item.label}</span>
			<span className="relative z-10 text-[13px] tabular-nums text-muted-foreground">{formatTime(item.minutes)}</span>
		</div>
	);
}

function TodayBreakdownSkeleton() {
	return (
		<Card className="@container/card gap-2 py-4">
			<CardHeader className="gap-1 px-4">
				<Skeleton className="h-3 w-20" />
				<Skeleton className="h-5 w-16" />
			</CardHeader>
			<CardContent className="space-y-2 px-4">
				<div className="flex items-center gap-3">
					<Skeleton className="h-4 flex-1" />
					<Skeleton className="h-4 w-10" />
				</div>
				<div className="flex items-center gap-3">
					<Skeleton className="h-4 flex-1" />
					<Skeleton className="h-4 w-10" />
				</div>
				<div className="flex items-center gap-3">
					<Skeleton className="h-4 flex-1" />
					<Skeleton className="h-4 w-10" />
				</div>
				<div className="flex items-center gap-3">
					<Skeleton className="h-4 flex-1" />
					<Skeleton className="h-4 w-10" />
				</div>
			</CardContent>
		</Card>
	);
}

export function TodayBreakdown() {
	const [view, setView] = useState<View>('topic');
	const [drawerOpen, setDrawerOpen] = useState(false);
	const { data, isLoading, isEmpty } = useTodayBreakdownData();

	if (isLoading) {
		return <TodayBreakdownSkeleton />;
	}

	if (isEmpty) {
		return (
			<Card className="@container/card gap-2 py-4">
				<Empty className="px-4">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<List className="size-4" />
						</EmptyMedia>
						<EmptyTitle className="text-sm">No breakdown yet</EmptyTitle>
						<EmptyDescription className="text-xs">Activity will appear here as you learn</EmptyDescription>
					</EmptyHeader>
					<Button variant="outline" size="sm" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
						Add activity
					</Button>
				</Empty>
			</Card>
		);
	}

	const items = view === 'topic' ? data.topics : data.sources;
	const totalMinutes = items.reduce((sum, i) => sum + i.minutes, 0);
	const maxMinutes = Math.max(...items.map((i) => i.minutes), 1);
	const displayItems = items.slice(0, 4);
	const hasMore = items.length > 4;

	return (
		<>
			<Card className="@container/card gap-2 py-4">
				<CardHeader className="gap-1 px-4">
					<CardDescription className="text-xs">Today by {view}</CardDescription>
					<CardTitle className="min-w-[4.5rem] text-lg tabular-nums">{formatTime(totalMinutes)}</CardTitle>
					<CardAction>
						{/* Toggle */}
						<div className="flex items-center gap-0.5 rounded-md bg-card p-0.5">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setView('topic')}
								className={cn(
									'h-6 min-w-[52px] px-2 text-[11px]',
									view === 'topic' ? 'bg-muted text-card-foreground hover:bg-muted' : 'text-muted-foreground'
								)}
							>
								Topic
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setView('source')}
								className={cn(
									'h-6 min-w-[52px] px-2 text-[11px]',
									view === 'source' ? 'bg-muted text-card-foreground hover:bg-muted' : 'text-muted-foreground'
								)}
							>
								Source
							</Button>
						</div>
					</CardAction>
				</CardHeader>
				<CardContent className="px-4">
					{/* Bar list - fixed height container to prevent layout shift */}
					<div className="min-h-[122px] space-y-0.5">
						{displayItems.map((item) => (
							<BarListItem key={item.id} item={item} maxMinutes={maxMinutes} />
						))}
					</div>

					{/* View all button container - fixed height to prevent layout shift */}
					<div className="mt-2 h-5">
						{hasMore && (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setDrawerOpen(true)}
								className="h-auto px-0 text-[12px] text-muted-foreground hover:bg-transparent hover:text-card-foreground"
							>
								+{items.length - 4} more · View all →
							</Button>
						)}
					</div>
				</CardContent>
			</Card>

			<BreakdownDrawer open={drawerOpen} onOpenChange={setDrawerOpen} type={view} items={items} />
		</>
	);
}

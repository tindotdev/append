import { Link } from '@tanstack/react-router';
import { Clock, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { useTodayHeroData } from '../hooks/use-dashboard-data';

function formatTime(minutes: number): string {
	if (minutes < 60) return `${Math.round(minutes)}m`;
	const hours = Math.floor(minutes / 60);
	const mins = Math.round(minutes % 60);
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatDelta(todayMinutes: number, avgMinutes: number): { text: string; isPositive: boolean } {
	const delta = todayMinutes - avgMinutes;
	const absDelta = Math.abs(delta);
	const text = delta >= 0 ? `+${formatTime(absDelta)}` : `-${formatTime(absDelta)}`;
	return { text, isPositive: delta >= 0 };
}

function TodayHeroCardSkeleton() {
	return (
		<Card className="@container/card gap-2 py-4">
			<CardHeader className="gap-1 px-4">
				<Skeleton className="h-3 w-12" />
				<Skeleton className="h-7 w-20" />
			</CardHeader>
			<CardFooter className="px-4">
				<Skeleton className="h-3 w-28" />
			</CardFooter>
		</Card>
	);
}

export function TodayHeroCard() {
	const { data, isLoading, isEmpty } = useTodayHeroData();

	if (isLoading) {
		return <TodayHeroCardSkeleton />;
	}

	if (isEmpty) {
		return (
			<Card className="@container/card gap-2 py-4">
				<Empty className="px-4">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Clock className="size-4" />
						</EmptyMedia>
						<EmptyTitle className="text-sm">No activity today</EmptyTitle>
						<EmptyDescription className="text-xs">Start a session to track your learning</EmptyDescription>
					</EmptyHeader>
					<Button variant="outline" size="sm" asChild>
						<Link to="/batch/new">Start session</Link>
					</Button>
				</Empty>
			</Card>
		);
	}

	const delta = formatDelta(data.todayMinutes, data.sevenDayAvgMinutes);
	const TrendIcon = delta.isPositive ? TrendingUp : TrendingDown;

	return (
		<Card className="@container/card gap-2 py-4">
			<CardHeader className="gap-1 px-4">
				<CardDescription className="text-xs">Today</CardDescription>
				<CardTitle className="text-2xl tabular-nums">{formatTime(data.todayMinutes)}</CardTitle>
				<CardAction>
					<Badge variant="outline" className="flex gap-1 rounded-lg text-xs">
						<TrendIcon className="size-3" />
						{delta.text}
					</Badge>
				</CardAction>
			</CardHeader>
			<CardFooter className="px-4 text-xs text-muted-foreground">vs 7-day avg ({formatTime(data.sevenDayAvgMinutes)}/day)</CardFooter>
		</Card>
	);
}

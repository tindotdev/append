import { Link } from '@tanstack/react-router';
import { Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { useStreakData } from '../hooks/use-dashboard-data';

function StreakCardSkeleton() {
	return (
		<Card className="@container/card gap-2 py-4">
			<CardHeader className="gap-1 px-4">
				<Skeleton className="h-3 w-16" />
				<Skeleton className="h-7 w-12" />
			</CardHeader>
		</Card>
	);
}

export function StreakCard() {
	const { data, isLoading, isEmpty } = useStreakData();

	if (isLoading) {
		return <StreakCardSkeleton />;
	}

	if (isEmpty) {
		return (
			<Card className="@container/card gap-2 py-4">
				<Empty className="px-4">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Flame className="size-4" />
						</EmptyMedia>
						<EmptyTitle className="text-sm">No streak yet</EmptyTitle>
						<EmptyDescription className="text-xs">Learn for 10+ min daily to build a streak</EmptyDescription>
					</EmptyHeader>
					<Button variant="outline" size="sm" asChild>
						<Link to="/batch/new">Start today</Link>
					</Button>
				</Empty>
			</Card>
		);
	}

	return (
		<Card className="@container/card gap-2 py-4">
			<CardHeader className="gap-1 px-4">
				<CardDescription className="text-xs">Current streak</CardDescription>
				<CardTitle className="text-2xl tabular-nums">
					{data.currentStreak} day{data.currentStreak !== 1 ? 's' : ''}
				</CardTitle>
				<CardAction>
					<Flame className="size-5 text-orange-400" />
				</CardAction>
			</CardHeader>
		</Card>
	);
}

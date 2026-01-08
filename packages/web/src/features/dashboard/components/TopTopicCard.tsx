import { Link } from '@tanstack/react-router';
import { Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { useTopTopicData } from '../hooks/use-dashboard-data';

function formatTime(minutes: number): string {
	if (minutes < 60) return `${Math.round(minutes)}m`;
	const hours = Math.floor(minutes / 60);
	const mins = Math.round(minutes % 60);
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function TopTopicCardSkeleton() {
	return (
		<Card className="@container/card gap-2 py-4">
			<CardHeader className="gap-1 px-4">
				<Skeleton className="h-3 w-24" />
				<Skeleton className="h-5 w-20" />
			</CardHeader>
			<CardFooter className="px-4">
				<Skeleton className="h-3 w-24" />
			</CardFooter>
		</Card>
	);
}

export function TopTopicCard() {
	const { data, isLoading, isEmpty } = useTopTopicData();

	if (isLoading) {
		return <TopTopicCardSkeleton />;
	}

	if (isEmpty) {
		return (
			<Card className="@container/card gap-2 py-4">
				<Empty className="px-4">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Tag className="size-4" />
						</EmptyMedia>
						<EmptyTitle className="text-sm">No top topic yet</EmptyTitle>
						<EmptyDescription className="text-xs">Your most studied topic this week will appear here</EmptyDescription>
					</EmptyHeader>
					<Button variant="outline" size="sm" asChild>
						<Link to="/batch/new">Start learning</Link>
					</Button>
				</Empty>
			</Card>
		);
	}

	const percentage = Math.round((data.minutes / data.weeklyTotalMinutes) * 100);

	return (
		<Card className="@container/card gap-2 py-4">
			<CardHeader className="gap-1 px-4">
				<CardDescription className="text-xs">Top topic this week</CardDescription>
				<CardTitle className="truncate text-sm">{data.topic}</CardTitle>
				<CardAction>
					<Badge variant="outline" className="flex gap-1 rounded-lg text-xs">
						<Tag className="size-3" />
						{formatTime(data.minutes)}
					</Badge>
				</CardAction>
			</CardHeader>
			<CardFooter className="px-4 text-xs text-muted-foreground">{percentage}% of weekly time</CardFooter>
		</Card>
	);
}

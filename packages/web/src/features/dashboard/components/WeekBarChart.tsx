import { Link } from '@tanstack/react-router';
import { BarChart3 } from 'lucide-react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { useWeekBarChartData } from '../hooks/use-dashboard-data';

function formatTime(minutes: number): string {
	if (minutes < 60) return `${Math.round(minutes)}m`;
	const hours = Math.floor(minutes / 60);
	const mins = Math.round(minutes % 60);
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function WeekBarChartSkeleton() {
	return (
		<Card className="@container/card gap-2 py-4">
			<CardHeader className="gap-1 px-4">
				<Skeleton className="h-3 w-16" />
				<Skeleton className="h-5 w-24" />
			</CardHeader>
			<CardContent className="px-4">
				<Skeleton className="h-[100px] w-full" />
			</CardContent>
		</Card>
	);
}

interface CustomTooltipProps {
	active?: boolean;
	payload?: Array<{ payload: { dayLabel: string; minutes: number } }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
	if (!active || !payload?.length) return null;
	const data = payload[0].payload;

	return (
		<div className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[12px] shadow-lg">
			<span className="font-medium text-zinc-100">{data.dayLabel}</span>
			<span className="ml-1.5 text-zinc-400">{data.minutes > 0 ? formatTime(data.minutes) : 'No activity'}</span>
		</div>
	);
}

export function WeekBarChart() {
	const { data, isLoading, isEmpty } = useWeekBarChartData();

	if (isLoading) {
		return <WeekBarChartSkeleton />;
	}

	if (isEmpty) {
		return (
			<Card className="@container/card gap-2 py-4">
				<Empty className="px-4">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<BarChart3 className="size-4" />
						</EmptyMedia>
						<EmptyTitle className="text-sm">No weekly data</EmptyTitle>
						<EmptyDescription className="text-xs">Your 7-day activity will appear here</EmptyDescription>
					</EmptyHeader>
					<Button variant="outline" size="sm" asChild>
						<Link to="/batch/new">Start session</Link>
					</Button>
				</Empty>
			</Card>
		);
	}

	// Calculate total for the week
	const totalMinutes = data.days.reduce((sum, day) => sum + day.minutes, 0);

	return (
		<Card className="@container/card gap-2 py-4">
			<CardHeader className="gap-1 px-4">
				<CardDescription className="text-xs">Last 7 days</CardDescription>
				<CardTitle className="text-lg tabular-nums">{formatTime(totalMinutes)}</CardTitle>
			</CardHeader>
			<CardContent className="px-4">
				<div className="h-[100px]">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart data={data.days} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
							<XAxis dataKey="dayLabel" axisLine={false} tickLine={false} tick={{ fill: 'rgb(113 113 122)', fontSize: 11 }} dy={8} />
							<Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
							<Bar dataKey="minutes" fill="rgba(52,211,153,0.7)" radius={[3, 3, 0, 0]} maxBarSize={28} />
						</BarChart>
					</ResponsiveContainer>
				</div>
			</CardContent>
		</Card>
	);
}

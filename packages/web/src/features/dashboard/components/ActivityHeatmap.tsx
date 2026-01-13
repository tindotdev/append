import HeatMap from '@uiw/react-heat-map';
import { Activity } from 'lucide-react';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useHeatmapData } from '../hooks/use-heatmap-data';
import type { HeatmapDay } from '../types';

// Convert ISO date format to library format: "2026-01-01" → "2026/01/01"
function convertToHeatmapFormat(days: HeatmapDay[]) {
	return days.map((day) => ({
		date: day.date.replace(/-/g, '/'),
		count: day.minutes,
	}));
}

function formatTime(minutes: number): string {
	if (minutes < 60) return `${Math.round(minutes)}m`;
	const hours = Math.floor(minutes / 60);
	const mins = Math.round(minutes % 60);
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatDate(dateStr: string): string {
	// Convert "2026/01/15" to "Jan 15, 2026"
	const date = new Date(dateStr);
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const HEATMAP_COLORS = [
	'rgba(255,255,255,0.04)', // 0 - no activity
	'rgba(52,211,153,0.2)', // 8+ min
	'rgba(52,211,153,0.4)', // 30+ min
	'rgba(52,211,153,0.6)', // 60+ min
	'rgba(52,211,153,0.85)', // 90+ min
];

function ActivityHeatmapLegend() {
	return (
		<div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
			<span>Less</span>
			<div className="flex gap-0.5">
				{HEATMAP_COLORS.map((color) => (
					<div key={color} className="size-2.5 rounded-sm" style={{ backgroundColor: color }} />
				))}
			</div>
			<span>More</span>
		</div>
	);
}

function ActivityHeatmapSkeleton() {
	return (
		<Card className="@container/card gap-2 py-4">
			<CardHeader className="gap-1 px-4">
				<Skeleton className="h-3 w-16" />
				<Skeleton className="h-5 w-20" />
			</CardHeader>
			<CardContent className="px-4">
				<Skeleton className="h-[91px] w-full max-w-[720px]" />
			</CardContent>
		</Card>
	);
}

export function ActivityHeatmap() {
	const { data, stats, isLoading } = useHeatmapData();
	const convertedData = useMemo(() => convertToHeatmapFormat(data.days), [data.days]);

	if (isLoading) {
		return <ActivityHeatmapSkeleton />;
	}

	const isEmpty = stats.activeDays === 0;

	if (isEmpty) {
		return (
			<Card className="@container/card gap-2 py-4">
				<Empty className="px-4">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Activity />
						</EmptyMedia>
						<EmptyTitle className="text-sm">No activity yet</EmptyTitle>
						<EmptyDescription className="text-xs">Start capturing to see your activity patterns here</EmptyDescription>
					</EmptyHeader>
					<Button variant="outline" size="sm" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
						Add activity
					</Button>
				</Empty>
			</Card>
		);
	}

	return (
		<Card className="@container/card gap-2 py-4">
			<CardHeader className="gap-1 px-4">
				<CardDescription className="text-xs">This year</CardDescription>
				<CardTitle className="text-lg tabular-nums">{formatTime(stats.totalMinutes)}</CardTitle>
				<CardAction>
					<div className="flex items-center gap-2">
						<Badge variant="outline" className="rounded-lg text-xs">
							{stats.activeDays} days
						</Badge>
						<Badge variant="outline" className="rounded-lg text-xs">
							{formatTime(stats.avgPerDay)}/day
						</Badge>
					</div>
				</CardAction>
			</CardHeader>
			<CardContent className="px-4">
				<div className="relative">
					{/* Centered heatmap */}
					<div className="flex justify-center overflow-x-auto">
						<HeatMap
							value={convertedData}
							legendCellSize={0}
							width={720}
							startDate={new Date(`${data.year}/01/01`)}
							endDate={new Date(`${data.year}/12/31`)}
							rectSize={10}
							space={3}
							weekLabels={false}
							monthLabels={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']}
							style={{ color: 'var(--color-zinc-500)' }}
							panelColors={{
								0: HEATMAP_COLORS[0],
								8: HEATMAP_COLORS[1],
								30: HEATMAP_COLORS[2],
								60: HEATMAP_COLORS[3],
								90: HEATMAP_COLORS[4],
							}}
							rectRender={(props, data) => (
								<Tooltip key={props.key}>
									<TooltipTrigger asChild>
										<rect {...props} />
									</TooltipTrigger>
									<TooltipContent side="top" sideOffset={5}>
										<span className="font-medium">{formatDate(data.date)}</span>
										<span className="text-muted-foreground ml-1.5">{data.count ? formatTime(data.count) : 'No activity'}</span>
									</TooltipContent>
								</Tooltip>
							)}
						/>
					</div>
					{/* Legend at bottom right */}
					<div className="mt-1.5 flex justify-end">
						<ActivityHeatmapLegend />
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

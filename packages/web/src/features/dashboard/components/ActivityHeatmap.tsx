import HeatMap from '@uiw/react-heat-map';
import { useMemo } from 'react';
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

export function ActivityHeatmap() {
	const { data, stats } = useHeatmapData();
	const convertedData = useMemo(() => convertToHeatmapFormat(data.days), [data.days]);

	return (
		<div className="space-y-3">
			{/* Compact inline stats */}
			<div className="flex items-center gap-4 text-[13px]">
				<span className="font-medium text-zinc-100">{formatTime(stats.totalMinutes)}</span>
				<span className="text-zinc-500">this year</span>
				<span className="text-zinc-600">·</span>
				<span className="text-zinc-500">
					<span className="text-zinc-300 tabular-nums">{stats.activeDays}</span> active days
				</span>
				<span className="text-zinc-600">·</span>
				<span className="text-zinc-500">
					<span className="text-zinc-300 tabular-nums">{formatTime(stats.avgPerDay)}</span>/day avg
				</span>
			</div>

			{/* Compact heatmap */}
			<div className="overflow-x-auto">
				<HeatMap
					value={convertedData}
					legendCellSize={0}
					width={720}
					startDate={new Date('2026/01/01')}
					endDate={new Date('2026/12/31')}
					rectSize={10}
					space={3}
					weekLabels={false}
					monthLabels={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']}
					style={{ color: 'var(--color-zinc-500)' }}
					panelColors={{
						0: 'rgba(255,255,255,0.04)',
						8: 'rgba(52,211,153,0.2)',
						30: 'rgba(52,211,153,0.4)',
						60: 'rgba(52,211,153,0.6)',
						90: 'rgba(52,211,153,0.85)',
					}}
				/>
			</div>
		</div>
	);
}

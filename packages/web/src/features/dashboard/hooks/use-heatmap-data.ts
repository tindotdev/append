import { useMemo } from 'react';
import type { HeatmapData, HeatmapStatsData } from '../types';

function generateMockData(): HeatmapData {
	const days: { date: string; minutes: number }[] = [];

	// Start from the Sunday before January 1, 2026 (Dec 28, 2025)
	// End on the Saturday after December 31, 2026 (Jan 2, 2027)
	// This ensures complete weeks at both ends of the heatmap
	const startDate = new Date('2026/01/01'); // Sunday before Jan 1, 2026
	const endDate = new Date('2026/12/31'); // Saturday after Dec 31, 2026

	for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
		const dateStr = d.toISOString().split('T')[0];
		const year = d.getFullYear();

		// Only generate activity for 2026 days
		// Padding days (Dec 2025 and Jan 2027) will have 0 minutes
		let minutes = 0;
		if (year === 2026) {
			// 40% chance of activity for 2026 days only
			const hasActivity = Math.random() > 0.6;
			minutes = hasActivity
				? Math.floor(Math.random() * 120) + 10 // 10-130 minutes
				: 0;
		}

		days.push({
			date: dateStr,
			minutes,
		});
	}

	return {
		year: 2026,
		timezone: 'Asia/Bangkok',
		days,
	};
}

function calculateStats(data: HeatmapData): HeatmapStatsData {
	// Only count days from 2026 for stats (exclude December 2025 padding days)
	const days2026 = data.days.filter((d) => d.date.startsWith('2026-'));
	const activeDays = days2026.filter((d) => d.minutes > 0);
	const totalMinutes = activeDays.reduce((sum, d) => sum + d.minutes, 0);
	const avgPerDay = activeDays.length > 0 ? Math.round(totalMinutes / activeDays.length) : 0;

	return {
		totalMinutes,
		avgPerDay,
		activeDays: activeDays.length,
	};
}

interface UseHeatmapDataOptions {
	/** Force empty state for testing */
	forceEmpty?: boolean;
	/** Force loading state for testing */
	forceLoading?: boolean;
}

const EMPTY_DATA: HeatmapData = {
	year: 2026,
	timezone: 'Asia/Bangkok',
	days: [],
};

const EMPTY_STATS: HeatmapStatsData = {
	totalMinutes: 0,
	avgPerDay: 0,
	activeDays: 0,
};

export function useHeatmapData(options: UseHeatmapDataOptions = {}) {
	const { forceEmpty = false, forceLoading = false } = options;

	const data = useMemo(() => {
		if (forceLoading || forceEmpty) {
			return EMPTY_DATA;
		}
		return generateMockData();
	}, [forceEmpty, forceLoading]);

	const stats = useMemo(() => {
		if (forceLoading) {
			return EMPTY_STATS;
		}
		return calculateStats(data);
	}, [data, forceLoading]);

	return { data, stats, isLoading: forceLoading };
}

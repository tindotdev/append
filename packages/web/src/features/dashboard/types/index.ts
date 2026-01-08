export interface HeatmapDay {
	date: string; // ISO format: "2026-01-01"
	minutes: number;
}

export interface HeatmapData {
	year: number;
	timezone: string;
	days: HeatmapDay[];
}

export interface HeatmapStatsData {
	totalMinutes: number;
	avgPerDay: number;
	activeDays: number;
}

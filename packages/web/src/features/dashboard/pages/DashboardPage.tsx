import {
	ActivityHeatmap,
	StreakCard,
	TelemetryControls,
	TodayBreakdown,
	TodayCapturesList,
	TodayHeroCard,
	TopSourceCard,
	TopTopicCard,
	WeekBarChart,
} from '../components';

export function DashboardPage() {
	return (
		<div className="@container/main max-w-5xl">
			{/* Header */}
			<div className="mb-4">
				<h2 className="text-xl font-semibold">Dashboard</h2>
				<p className="mt-1 text-sm text-zinc-500">Learning minutes, sources, topics, and captures — derived from events</p>
			</div>

			<TelemetryControls />

			{/* Dashboard grid */}
			<div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @4xl/main:grid-cols-3">
				{/* Row 1: Hero + Streak + Top Source (3 cols) */}
				<TodayHeroCard />
				<StreakCard />
				<TopSourceCard />

				{/* Row 2: Breakdown + Captures + Top Topic (3 cols) */}
				<TodayBreakdown />
				<TodayCapturesList />
				<TopTopicCard />

				{/* Row 3: Week chart (full width - charts benefit from horizontal space) */}
				<div className="@xl/main:col-span-2 @4xl/main:col-span-3">
					<WeekBarChart />
				</div>

				{/* Row 4: Heatmap (full width) */}
				<div className="@xl/main:col-span-2 @4xl/main:col-span-3">
					<ActivityHeatmap />
				</div>
			</div>
		</div>
	);
}

import { ActivityHeatmap } from '../components';

export function DashboardPage() {
	return (
		<div className="max-w-5xl">
			<div className="mb-6">
				<h2 className="text-xl font-semibold">Dashboard</h2>
				<p className="text-sm text-zinc-500 mt-1">Track your daily activity across the year</p>
			</div>

			<ActivityHeatmap />
		</div>
	);
}

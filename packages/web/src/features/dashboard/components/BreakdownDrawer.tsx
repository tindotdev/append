import { DetailDrawer } from '@/components/ui/detail-drawer';
import type { BreakdownItem } from '../types';

function formatTime(minutes: number): string {
	if (minutes < 60) return `${Math.round(minutes)}m`;
	const hours = Math.floor(minutes / 60);
	const mins = Math.round(minutes % 60);
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

interface BarListItemProps {
	item: BreakdownItem;
	maxMinutes: number;
}

function BarListItem({ item, maxMinutes }: BarListItemProps) {
	const percentage = (item.minutes / maxMinutes) * 100;

	return (
		<div className="group relative flex items-center gap-3 px-2 py-1">
			{/* Background bar */}
			<div className="absolute inset-y-0 left-0 right-0 overflow-hidden rounded">
				<div className="h-full bg-emerald-400/10 transition-all group-hover:bg-emerald-400/15" style={{ width: `${percentage}%` }} />
			</div>
			{/* Content */}
			<span className="relative z-10 flex-1 truncate text-[13px] text-zinc-300">{item.label}</span>
			<span className="relative z-10 text-[13px] tabular-nums text-zinc-500">{formatTime(item.minutes)}</span>
		</div>
	);
}

interface BreakdownDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	type: 'topic' | 'source';
	items: BreakdownItem[];
}

export function BreakdownDrawer({ open, onOpenChange, type, items }: BreakdownDrawerProps) {
	const totalMinutes = items.reduce((sum, i) => sum + i.minutes, 0);
	const maxMinutes = Math.max(...items.map((i) => i.minutes), 1);
	const label = type === 'topic' ? 'topics' : 'sources';

	return (
		<DetailDrawer
			open={open}
			onOpenChange={onOpenChange}
			title={`${type === 'topic' ? 'Topics' : 'Sources'} Today`}
			subtitle={`${formatTime(totalMinutes)} across ${items.length} ${label}`}
		>
			<div className="space-y-0.5">
				{items.map((item) => (
					<BarListItem key={item.id} item={item} maxMinutes={maxMinutes} />
				))}
			</div>
		</DetailDrawer>
	);
}

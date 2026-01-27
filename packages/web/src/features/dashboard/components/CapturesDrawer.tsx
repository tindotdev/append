import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DetailDrawer } from '@/components/ui/detail-drawer';
import { Input } from '@/components/ui/input';
import type { CaptureItem, CaptureType } from '../types';

const CAPTURE_TYPE_LABELS: Record<CaptureType, string> = {
	term: 'term',
	question: 'question',
	note: 'note',
	snippet: 'snippet',
};

interface CaptureListItemProps {
	item: CaptureItem;
}

function CaptureListItem({ item }: CaptureListItemProps) {
	return (
		<div className="flex items-start gap-2 py-1">
			<Badge variant="outline" className="mt-0.5 shrink-0 px-1.5 py-0 text-[10px] text-muted-foreground">
				{CAPTURE_TYPE_LABELS[item.type]}
			</Badge>
			<div className="min-w-0 flex-1">
				<p className="truncate text-[13px] text-card-foreground">{item.label}</p>
				<p className="truncate text-[11px] text-muted-foreground">{item.source}</p>
			</div>
		</div>
	);
}

type FilterType = CaptureType | 'all';

interface CapturesDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	items: CaptureItem[];
	count: number;
}

export function CapturesDrawer({ open, onOpenChange, items, count }: CapturesDrawerProps) {
	const [filter, setFilter] = useState<FilterType>('all');
	const [search, setSearch] = useState('');

	const filteredItems = items.filter((item) => {
		if (filter !== 'all' && item.type !== filter) return false;
		if (search && !item.label.toLowerCase().includes(search.toLowerCase())) return false;
		return true;
	});

	// Reset filter and search when drawer closes
	const handleOpenChange = (isOpen: boolean) => {
		if (!isOpen) {
			setFilter('all');
			setSearch('');
		}
		onOpenChange(isOpen);
	};

	return (
		<DetailDrawer open={open} onOpenChange={handleOpenChange} title="Captures Today" subtitle={`${count} capture${count !== 1 ? 's' : ''}`}>
			{/* Toolbar */}
			<div className="mb-4 space-y-2">
				<div className="flex gap-1">
					{(['all', 'term', 'question'] as const).map((type) => (
						<Button
							key={type}
							variant={filter === type ? 'secondary' : 'ghost'}
							size="sm"
							onClick={() => setFilter(type)}
							className="h-7 text-xs"
						>
							{type === 'all' ? 'All' : type === 'term' ? 'Terms' : 'Questions'}
						</Button>
					))}
				</div>
				<Input placeholder="Search captures..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-sm" />
			</div>

			{/* List */}
			<div className="space-y-1">
				{filteredItems.map((item) => (
					<CaptureListItem key={item.id} item={item} />
				))}
				{filteredItems.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No captures found</p>}
			</div>
		</DetailDrawer>
	);
}

/**
 * Sortable bucket list with drag-drop reordering.
 */

import { closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { UserBucket } from '../api/user-bucket';

interface BucketListProps {
	buckets: UserBucket[];
	onReorder: (bucketIds: string[]) => void;
	onEdit: (bucket: UserBucket) => void;
	onDelete: (bucket: UserBucket) => void;
	isReordering: boolean;
}

function SortableBucketItem({ bucket, onEdit, onDelete }: { bucket: UserBucket; onEdit: () => void; onDelete: () => void }) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: bucket.id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	return (
		<div ref={setNodeRef} style={style} className="flex items-center gap-3 rounded-lg border border-border bg-card/50 p-4">
			<button
				type="button"
				className="touch-none cursor-grab text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
				{...attributes}
				{...listeners}
			>
				<GripVertical className="size-5" />
			</button>

			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					{bucket.color && <div className="size-3 rounded-full" style={{ backgroundColor: bucket.color }} />}
					<span className="font-medium text-card-foreground">{bucket.name}</span>
					<span className="text-sm text-muted-foreground">({bucket.slug})</span>
				</div>
				<p className="text-sm text-muted-foreground mt-1 truncate">{bucket.description}</p>
				<p className="text-xs text-muted-foreground mt-1">
					{bucket.senseCount} item{bucket.senseCount !== 1 ? 's' : ''}
				</p>
			</div>

			<div className="flex items-center gap-2">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button type="button" variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${bucket.name}`}>
							<Pencil className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Edit bucket</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={onDelete}
							aria-label={`Delete ${bucket.name}`}
							disabled={bucket.senseCount > 0}
						>
							<Trash2 className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>{bucket.senseCount > 0 ? `Remove all ${bucket.senseCount} items first` : 'Delete bucket'}</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}

export function BucketList({ buckets, onReorder, onEdit, onDelete, isReordering }: BucketListProps) {
	const [items, setItems] = useState(buckets);

	// Keep local state in sync with props
	if (buckets !== items && buckets.length !== items.length) {
		setItems(buckets);
	}

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	);

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event;

		if (over && active.id !== over.id) {
			setItems((currentItems) => {
				const oldIndex = currentItems.findIndex((item) => item.id === active.id);
				const newIndex = currentItems.findIndex((item) => item.id === over.id);

				const newItems = arrayMove(currentItems, oldIndex, newIndex);
				onReorder(newItems.map((item) => item.id));
				return newItems;
			});
		}
	}

	if (buckets.length === 0) {
		return (
			<div className="rounded-lg border border-border bg-card/30 p-8 text-center">
				<p className="text-muted-foreground">No buckets yet. Create your first bucket to get started.</p>
			</div>
		);
	}

	return (
		<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
			<SortableContext items={items.map((b) => b.id)} strategy={verticalListSortingStrategy}>
				<div className="space-y-2">
					{items.map((bucket) => (
						<SortableBucketItem key={bucket.id} bucket={bucket} onEdit={() => onEdit(bucket)} onDelete={() => onDelete(bucket)} />
					))}
				</div>
			</SortableContext>
			{isReordering && <p className="text-sm text-muted-foreground mt-2 text-center">Saving order...</p>}
		</DndContext>
	);
}

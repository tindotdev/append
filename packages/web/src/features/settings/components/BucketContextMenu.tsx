import { Edit, FileDown, Link2, Palette, Trash2 } from 'lucide-react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';

interface BucketContextMenuProps {
	bucket: {
		id: string;
		slug: string;
		name: string;
		senseCount: number;
	};
	onEdit: () => void;
	onChangeColor: () => void;
	onExport: () => void;
	onCopyLink: () => void;
	onDelete: () => void;
	children: React.ReactNode;
}

export function BucketContextMenu({ bucket, onEdit, onChangeColor, onExport, onCopyLink, onDelete, children }: BucketContextMenuProps) {
	const hasItems = bucket.senseCount > 0;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent className="w-56">
				<ContextMenuItem onClick={onEdit}>
					<Edit className="mr-2 h-4 w-4" />
					Edit Bucket
				</ContextMenuItem>
				<ContextMenuItem onClick={onChangeColor}>
					<Palette className="mr-2 h-4 w-4" />
					Change Color
				</ContextMenuItem>

				<ContextMenuSeparator />

				<ContextMenuItem onClick={onExport}>
					<FileDown className="mr-2 h-4 w-4" />
					Export Bucket
				</ContextMenuItem>
				<ContextMenuItem onClick={onCopyLink}>
					<Link2 className="mr-2 h-4 w-4" />
					Copy Link
				</ContextMenuItem>

				<ContextMenuSeparator />

				<ContextMenuItem onClick={onDelete} disabled={hasItems} className="text-destructive focus:text-destructive disabled:opacity-50">
					<Trash2 className="mr-2 h-4 w-4" />
					Delete {hasItems ? `(${bucket.senseCount} items)` : ''}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

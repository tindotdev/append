import { Copy, Edit, ExternalLink, FileDown, Link2, Palette, Trash2 } from 'lucide-react';
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from '@/components/ui/context-menu';

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
	onDuplicate?: () => void;
	onOpenInNewTab?: () => void;
	children: React.ReactNode;
}

export function BucketContextMenu({
	bucket,
	onEdit,
	onChangeColor,
	onExport,
	onCopyLink,
	onDelete,
	onDuplicate,
	onOpenInNewTab,
	children,
}: BucketContextMenuProps) {
	const hasItems = bucket.senseCount > 0;

	const handleOpenInNewTab = () => {
		if (onOpenInNewTab) {
			onOpenInNewTab();
		} else {
			// Default behavior: open bucket in new tab
			window.open(`/bucket/${bucket.slug}`, '_blank');
		}
	};

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent className="w-56">
				<ContextMenuItem onClick={onEdit}>
					<Edit className="mr-2 h-4 w-4" />
					Edit Bucket
					<ContextMenuShortcut>E</ContextMenuShortcut>
				</ContextMenuItem>
				<ContextMenuItem onClick={onChangeColor}>
					<Palette className="mr-2 h-4 w-4" />
					Change Color
				</ContextMenuItem>
				{onDuplicate && (
					<ContextMenuItem onClick={onDuplicate}>
						<Copy className="mr-2 h-4 w-4" />
						Duplicate Bucket
					</ContextMenuItem>
				)}

				<ContextMenuSeparator />

				<ContextMenuItem onClick={handleOpenInNewTab}>
					<ExternalLink className="mr-2 h-4 w-4" />
					Open in New Tab
					<ContextMenuShortcut>⌘↵</ContextMenuShortcut>
				</ContextMenuItem>

				<ContextMenuSeparator />

				<ContextMenuItem onClick={onExport}>
					<FileDown className="mr-2 h-4 w-4" />
					Export Bucket
				</ContextMenuItem>
				<ContextMenuItem onClick={onCopyLink}>
					<Link2 className="mr-2 h-4 w-4" />
					Copy Link
					<ContextMenuShortcut>⌘C</ContextMenuShortcut>
				</ContextMenuItem>

				<ContextMenuSeparator />

				<ContextMenuItem onClick={onDelete} disabled={hasItems} className="text-destructive focus:text-destructive disabled:opacity-50">
					<Trash2 className="mr-2 h-4 w-4" />
					Delete {hasItems ? `(${bucket.senseCount} items)` : ''}
					<ContextMenuShortcut>⌫</ContextMenuShortcut>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

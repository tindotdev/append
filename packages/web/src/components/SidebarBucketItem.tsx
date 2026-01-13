import { Link, useLocation } from '@tanstack/react-router';
import { Edit, FileDown, FolderOpen, Link2, MoreHorizontal, Palette, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BucketColorPicker } from '@/features/settings/components/BucketColorPicker';
import { BucketContextMenu } from '@/features/settings/components/BucketContextMenu';
import { cn } from '@/lib/utils';

interface SidebarBucketItemProps {
	bucket: {
		id: string;
		slug: string;
		name: string;
		description: string;
		color?: string | null;
		senseCount: number;
	};
	onEdit: () => void;
	onColorChange: (color: string | null) => void;
	onExport: () => void;
	onDelete: () => void;
	onQuickAdd: () => void;
}

export function SidebarBucketItem({ bucket, onEdit, onColorChange, onExport, onDelete, onQuickAdd }: SidebarBucketItemProps) {
	const location = useLocation();
	const { isMobile } = useSidebar();
	const [isHovered, setIsHovered] = useState(false);
	const isActive = location.pathname === `/bucket/${bucket.slug}`;
	const hasItems = bucket.senseCount > 0;

	const handleCopyLink = () => {
		const url = `${window.location.origin}/bucket/${bucket.slug}`;
		navigator.clipboard.writeText(url);
		toast.success('Link copied to clipboard');
	};

	return (
		<BucketContextMenu
			bucket={bucket}
			onEdit={onEdit}
			onChangeColor={() => {
				/* Will trigger from dropdown */
			}}
			onExport={onExport}
			onCopyLink={handleCopyLink}
			onDelete={onDelete}
		>
			<SidebarMenuItem onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} className="relative group">
				<SidebarMenuButton asChild isActive={isActive} className="h-auto py-1.5 pr-1">
					<Link to="/bucket/$slug" params={{ slug: bucket.slug }} search={{ term: undefined }}>
						<div className="flex items-start gap-2 flex-1 min-w-0">
							{/* Color indicator or folder icon */}
							<div className="flex-shrink-0 mt-0.5">
								{bucket.color ? (
									<span
										className="h-2 w-2 rounded-full ring-1 ring-border/50"
										style={{ backgroundColor: bucket.color }}
										title={`${bucket.name} color indicator`}
									/>
								) : (
									<FolderOpen className="size-4 opacity-70" />
								)}
							</div>

							{/* Bucket name and description */}
							<div className="flex-1 min-w-0">
								<div className="flex items-center justify-between gap-2">
									<TooltipProvider delayDuration={500}>
										<Tooltip>
											<TooltipTrigger asChild>
												<span className="text-[13px] font-normal truncate">{bucket.name}</span>
											</TooltipTrigger>
											<TooltipContent side="right" className="max-w-xs">
												{bucket.name}
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
									<span className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0">{bucket.senseCount}</span>
								</div>
								{bucket.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{bucket.description}</p>}
							</div>
						</div>
					</Link>
				</SidebarMenuButton>

				{/* Hover-triggered actions (Notion-style) */}
				<div
					className={cn(
						'absolute right-1 top-1.5 flex items-center gap-0.5 bg-sidebar z-10',
						'transition-opacity duration-150 ease-out',
						isMobile || isHovered || isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
					)}
				>
					{/* Three-dot dropdown menu */}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" className="h-6 w-6 rounded-sm hover:bg-sidebar-accent" onClick={(e) => e.stopPropagation()}>
								<MoreHorizontal className="h-3.5 w-3.5" />
								<span className="sr-only">Options for {bucket.name}</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56">
							<DropdownMenuItem onClick={onEdit}>
								<Edit className="mr-2 h-4 w-4" />
								Edit Bucket
							</DropdownMenuItem>

							<BucketColorPicker currentColor={bucket.color || null} onColorChange={onColorChange}>
								<DropdownMenuItem onSelect={(e) => e.preventDefault()}>
									<Palette className="mr-2 h-4 w-4" />
									Change Color
								</DropdownMenuItem>
							</BucketColorPicker>

							<DropdownMenuSeparator />

							<DropdownMenuItem onClick={onExport}>
								<FileDown className="mr-2 h-4 w-4" />
								Export Bucket
							</DropdownMenuItem>
							<DropdownMenuItem onClick={handleCopyLink}>
								<Link2 className="mr-2 h-4 w-4" />
								Copy Link
							</DropdownMenuItem>

							<DropdownMenuSeparator />

							<DropdownMenuItem onClick={onDelete} disabled={hasItems} className="text-destructive focus:text-destructive disabled:opacity-50">
								<Trash2 className="mr-2 h-4 w-4" />
								Delete {hasItems ? `(${bucket.senseCount} items)` : ''}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>

					{/* Quick add button */}
					<Button
						variant="ghost"
						size="icon"
						className="h-6 w-6 rounded-sm hover:bg-sidebar-accent"
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							onQuickAdd();
						}}
					>
						<Plus className="h-3.5 w-3.5" />
						<span className="sr-only">Add to {bucket.name}</span>
					</Button>
				</div>
			</SidebarMenuItem>
		</BucketContextMenu>
	);
}

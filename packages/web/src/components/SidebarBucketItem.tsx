import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link, useLocation } from '@tanstack/react-router';
import { Copy, Edit, ExternalLink, FileDown, GripVertical, Image, Link2, MoreHorizontal, Trash2 } from 'lucide-react';
import { forwardRef, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { BucketIconPickerMenu } from '@/components/BucketIconPicker';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BucketContextMenu } from '@/features/settings/components/BucketContextMenu';
import { getBucketIcon } from '@/lib/bucket-icons';
import { cn } from '@/lib/utils';

interface SidebarBucketItemProps {
	bucket: {
		id: string;
		slug: string;
		name: string;
		description: string;
		icon?: string | null;
		senseCount: number;
	};
	onEdit: () => void;
	onIconChange: (icon: string | null) => void;
	onNameChange: (name: string) => Promise<void>;
	onExport: () => void;
	onDelete: () => void;
	onDuplicate?: () => void;
}

export const SidebarBucketItem = forwardRef<HTMLAnchorElement, SidebarBucketItemProps>(
	({ bucket, onEdit, onIconChange, onNameChange, onExport, onDelete, onDuplicate }, ref) => {
		const location = useLocation();
		const { isMobile } = useSidebar();
		const [isHovered, setIsHovered] = useState(false);
		const [isRenaming, setIsRenaming] = useState(false);
		const [nameValue, setNameValue] = useState(bucket.name);
		const inputRef = useRef<HTMLInputElement>(null);
		const isActive = location.pathname === `/bucket/${bucket.slug}`;
		const hasItems = bucket.senseCount > 0;

		// Get icon component
		const BucketIcon = getBucketIcon(bucket.icon);

		// DnD sortable hook
		const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: bucket.id });

		const style = {
			transform: CSS.Transform.toString(transform),
			transition,
			opacity: isDragging ? 0.5 : 1,
		};

		// Focus input when renaming mode activates
		useEffect(() => {
			if (isRenaming) {
				inputRef.current?.focus();
				inputRef.current?.select();
			}
		}, [isRenaming]);

		const handleCopyLink = () => {
			const url = `${window.location.origin}/bucket/${bucket.slug}`;
			navigator.clipboard.writeText(url);
			toast.success('Link copied to clipboard');
		};

		const handleOpenInNewTab = () => {
			window.open(`/bucket/${bucket.slug}`, '_blank');
		};

		const handleDoubleClick = (e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setIsRenaming(true);
		};

		const handleSaveRename = async () => {
			const trimmedName = nameValue.trim();
			if (trimmedName && trimmedName !== bucket.name) {
				try {
					await onNameChange(trimmedName);
					toast.success('Bucket renamed');
				} catch {
					toast.error('Failed to rename bucket');
					setNameValue(bucket.name);
				}
			}
			setIsRenaming(false);
		};

		const handleCancelRename = () => {
			setNameValue(bucket.name);
			setIsRenaming(false);
		};

		const handleIconChange = async (icon: string | null) => {
			try {
				await onIconChange(icon);
				toast.success('Bucket icon updated');
			} catch {
				toast.error('Failed to update icon');
			}
		};

		return (
			<BucketContextMenu
				bucket={bucket}
				onEdit={onEdit}
				onExport={onExport}
				onCopyLink={handleCopyLink}
				onDelete={onDelete}
				onDuplicate={onDuplicate}
				onOpenInNewTab={handleOpenInNewTab}
			>
				<SidebarMenuItem
					ref={setNodeRef}
					style={style}
					onMouseEnter={() => setIsHovered(true)}
					onMouseLeave={() => setIsHovered(false)}
					className="relative group"
					role="treeitem"
					aria-level={1}
					aria-selected={isActive}
					tabIndex={0}
				>
					{/* Drag handle - only visible on hover */}
					<button
						{...attributes}
						{...listeners}
						type="button"
						className={cn(
							'absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-4 h-6 z-10',
							'transition-opacity duration-150 ease-out cursor-grab active:cursor-grabbing',
							isMobile || isHovered || isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
						)}
						onClick={(e) => e.stopPropagation()}
					>
						<GripVertical className="h-3 w-3 text-muted-foreground" />
					</button>

					<SidebarMenuButton asChild isActive={isActive} className="h-auto py-1.5 pr-1 pl-4">
						<Link to="/bucket/$slug" params={{ slug: bucket.slug }} search={{ term: undefined }} ref={ref} tabIndex={0}>
							<div className="flex items-start gap-2 flex-1 min-w-0">
								{/* Bucket icon */}
								<div className="flex-shrink-0 mt-0.5">
									<BucketIcon className="size-4 opacity-70" />
								</div>

								{/* Bucket name and description */}
								<div className="flex-1 min-w-0">
									<div className="flex items-center justify-between gap-2">
										{isRenaming ? (
											<Input
												ref={inputRef}
												value={nameValue}
												onChange={(e) => setNameValue(e.target.value)}
												onBlur={handleSaveRename}
												onKeyDown={(e) => {
													if (e.key === 'Enter') handleSaveRename();
													if (e.key === 'Escape') handleCancelRename();
													e.stopPropagation();
												}}
												onClick={(e) => e.preventDefault()}
												className="h-6 text-[13px] font-normal px-1 -ml-1"
											/>
										) : (
											<TooltipProvider delayDuration={500}>
												<Tooltip>
													<TooltipTrigger asChild>
														<button
															type="button"
															className="text-[13px] font-normal truncate cursor-text select-none text-left bg-transparent border-none p-0 flex-1 min-w-0"
															onDoubleClick={handleDoubleClick}
														>
															{bucket.name}
														</button>
													</TooltipTrigger>
													<TooltipContent side="right" className="max-w-xs">
														{bucket.name}
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										)}
										<span
											className={cn(
												'text-[11px] text-muted-foreground tabular-nums flex-shrink-0',
												'transition-opacity duration-150 ease-out',
												isMobile || isHovered || isActive ? 'opacity-0' : 'opacity-100'
											)}
										>
											{bucket.senseCount}
										</span>
									</div>
								</div>
							</div>
						</Link>
					</SidebarMenuButton>

					{/* Hover-triggered actions (Notion-style) */}
					<div
						className={cn(
							'absolute right-1 top-1.5 flex items-center gap-0.5 z-10',
							'transition-opacity duration-150 ease-out',
							isMobile || isHovered || isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
						)}
					>
						{/* Three-dot dropdown menu */}
						<DropdownMenu modal={false}>
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
									<DropdownMenuShortcut>E</DropdownMenuShortcut>
								</DropdownMenuItem>

								<BucketIconPickerMenu onIconChange={handleIconChange}>
									<DropdownMenuSubTrigger>
										<Image className="mr-2 h-4 w-4" />
										Change Icon
									</DropdownMenuSubTrigger>
								</BucketIconPickerMenu>

								{onDuplicate && (
									<DropdownMenuItem onClick={onDuplicate}>
										<Copy className="mr-2 h-4 w-4" />
										Duplicate Bucket
									</DropdownMenuItem>
								)}

								<DropdownMenuSeparator />

								<DropdownMenuItem onClick={handleOpenInNewTab}>
									<ExternalLink className="mr-2 h-4 w-4" />
									Open in New Tab
									<DropdownMenuShortcut>⌘↵</DropdownMenuShortcut>
								</DropdownMenuItem>

								<DropdownMenuSeparator />

								<DropdownMenuItem onClick={onExport}>
									<FileDown className="mr-2 h-4 w-4" />
									Export Bucket
								</DropdownMenuItem>
								<DropdownMenuItem onClick={handleCopyLink}>
									<Link2 className="mr-2 h-4 w-4" />
									Copy Link
									<DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
								</DropdownMenuItem>

								<DropdownMenuSeparator />

								<DropdownMenuItem onClick={onDelete} disabled={hasItems} className="text-destructive focus:text-destructive disabled:opacity-50">
									<Trash2 className="mr-2 h-4 w-4" />
									Delete {hasItems ? `(${bucket.senseCount} items)` : ''}
									<DropdownMenuShortcut>⌫</DropdownMenuShortcut>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</SidebarMenuItem>
			</BucketContextMenu>
		);
	}
);

SidebarBucketItem.displayName = 'SidebarBucketItem';

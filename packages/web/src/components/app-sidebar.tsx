import { closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import {
	Archive,
	ChevronDown,
	FileDown,
	FileUp,
	FolderOpen,
	LayoutDashboard,
	LogOut,
	PenSquare,
	Plus,
	Settings,
	Shield,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	SidebarSeparator,
	useSidebar,
} from '@/components/ui/sidebar';
import { signOut, useAuth } from '@/features/auth';
import { type UserBucket, useDeleteBucket, useReorderBuckets, useUpdateBucket, useUserBuckets } from '@/features/settings';
import { BucketCreateSheet } from '@/features/settings/components/BucketCreateSheet';
import { BucketEditSheet } from '@/features/settings/components/BucketEditSheet';
import { SidebarBucketItem } from './SidebarBucketItem';

const NAV_ITEMS = [
	{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, shortcut: undefined },
	{ to: '/batch/new', label: 'Capture', icon: Plus, shortcut: 'C' },
	{ to: '/batch', label: 'Batches', icon: Archive, shortcut: 'G B' },
] as const;

const UTILITY_ITEMS = [
	{ to: '/import', label: 'Import', icon: FileDown, shortcut: 'G I' },
	{ to: '/export', label: 'Export', icon: FileUp, shortcut: 'G E' },
	{ to: '/privacy', label: 'Privacy', icon: Shield, shortcut: undefined },
] as const;

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const location = useLocation();
	const navigate = useNavigate();
	const { data: session } = useAuth();
	const { data: bucketsData } = useUserBuckets({ enabled: !!session });
	const buckets = bucketsData?.buckets ?? [];
	const { isMobile } = useSidebar();
	const [bucketsOpen, setBucketsOpen] = React.useState(true);
	const [createSheetOpen, setCreateSheetOpen] = React.useState(false);
	const [editTarget, setEditTarget] = React.useState<UserBucket | null>(null);
	const [deleteTarget, setDeleteTarget] = React.useState<UserBucket | null>(null);
	const [deleteError, setDeleteError] = React.useState<string | null>(null);
	const [focusedItemIndex, setFocusedItemIndex] = React.useState<number>(-1);
	const menuItemsRef = React.useRef<(HTMLAnchorElement | null)[]>([]);

	const updateBucketMutation = useUpdateBucket();
	const deleteBucketMutation = useDeleteBucket();
	const reorderBucketsMutation = useReorderBuckets();

	// DnD sensors for drag-and-drop
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8, // 8px movement required before drag starts
			},
		}),
		useSensor(KeyboardSensor)
	);

	const user = session?.user;
	const userInitials =
		user?.name
			?.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2) ??
		user?.email?.slice(0, 2).toUpperCase() ??
		'U';

	// Bucket action handlers
	const handleEditBucket = (bucketId: string) => {
		const bucket = buckets.find((b) => b.id === bucketId);
		if (bucket) {
			setEditTarget(bucket);
		}
	};

	const handleColorChange = async (bucketId: string, color: string | null) => {
		try {
			await updateBucketMutation.mutateAsync({ id: bucketId, input: { color } });
			toast.success('Bucket color updated');
		} catch (_error) {
			toast.error('Failed to update color');
		}
	};

	const handleIconChange = async (bucketId: string, icon: string | null) => {
		await updateBucketMutation.mutateAsync({ id: bucketId, input: { icon } });
	};

	const handleNameChange = async (bucketId: string, name: string) => {
		await updateBucketMutation.mutateAsync({ id: bucketId, input: { name } });
	};

	const handleExportBucket = (bucketId: string) => {
		// Navigate to export page with bucket filter
		const bucket = buckets.find((b) => b.id === bucketId);
		if (bucket) {
			navigate({ to: '/export', search: { bucket: bucket.slug } });
		}
	};

	const handleDeleteBucket = (bucketId: string) => {
		const bucket = buckets.find((b) => b.id === bucketId);
		if (!bucket) return;
		setDeleteTarget(bucket);
	};

	const confirmDelete = async () => {
		if (!deleteTarget) return;

		try {
			setDeleteError(null);
			await deleteBucketMutation.mutateAsync(deleteTarget.id);
			toast.success('Bucket deleted');
			setDeleteTarget(null);
		} catch (_error) {
			setDeleteError('Failed to delete bucket');
		}
	};

	const closeDeleteDialog = () => {
		setDeleteTarget(null);
		setDeleteError(null);
	};

	const handleQuickAdd = (bucketSlug: string) => {
		// Navigate to capture page with bucket pre-selected
		navigate({ to: '/batch/new', search: { bucket: bucketSlug } });
	};

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;

		if (!over || active.id === over.id) return;

		// Find the indices of the dragged and target buckets
		const oldIndex = buckets.findIndex((b) => b.id === active.id);
		const newIndex = buckets.findIndex((b) => b.id === over.id);

		if (oldIndex === -1 || newIndex === -1) return;

		// Reorder the buckets array
		const reorderedBuckets = [...buckets];
		const [removed] = reorderedBuckets.splice(oldIndex, 1);
		reorderedBuckets.splice(newIndex, 0, removed);

		// Optimistically update UI and persist to backend
		try {
			await reorderBucketsMutation.mutateAsync(reorderedBuckets.map((b) => b.id));
		} catch (_error) {
			toast.error('Failed to reorder buckets');
		}
	};

	// Keyboard navigation for sidebar items
	React.useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			// Skip if user is typing in input/textarea or if a modal is open
			const target = event.target as HTMLElement;
			const isEditing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
			if (isEditing || deleteTarget !== null || editTarget !== null || createSheetOpen) {
				return;
			}

			// Get all navigable items (NAV_ITEMS + buckets + UTILITY_ITEMS)
			const totalNavItems = NAV_ITEMS.length;
			const totalBucketItems = bucketsOpen ? buckets.length : 0;
			const totalUtilityItems = UTILITY_ITEMS.length;
			const totalItems = totalNavItems + totalBucketItems + totalUtilityItems;

			switch (event.key) {
				case 'ArrowDown':
					event.preventDefault();
					setFocusedItemIndex((prev) => {
						const next = prev < totalItems - 1 ? prev + 1 : 0;
						// Focus the element
						setTimeout(() => menuItemsRef.current[next]?.focus(), 0);
						return next;
					});
					break;

				case 'ArrowUp':
					event.preventDefault();
					setFocusedItemIndex((prev) => {
						const next = prev > 0 ? prev - 1 : totalItems - 1;
						setTimeout(() => menuItemsRef.current[next]?.focus(), 0);
						return next;
					});
					break;

				case 'Home':
					event.preventDefault();
					setFocusedItemIndex(0);
					setTimeout(() => menuItemsRef.current[0]?.focus(), 0);
					break;

				case 'End':
					event.preventDefault();
					setFocusedItemIndex(totalItems - 1);
					setTimeout(() => menuItemsRef.current[totalItems - 1]?.focus(), 0);
					break;

				case 'Enter':
					event.preventDefault();
					if (focusedItemIndex >= 0) {
						menuItemsRef.current[focusedItemIndex]?.click();
					}
					break;

				default:
					break;
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [focusedItemIndex, bucketsOpen, buckets.length, deleteTarget, editTarget, createSheetOpen]);

	return (
		<Sidebar collapsible="icon" {...props}>
			{/* Header with user menu and action icons (Linear-style) */}
			<SidebarHeader className="pb-0">
				<div className="flex items-center justify-between">
					<SidebarMenu>
						<SidebarMenuItem>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<SidebarMenuButton size="lg" className="h-9 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
										<Avatar className="h-6 w-6 rounded-md">
											<AvatarImage src={user?.image ?? undefined} alt={user?.name ?? 'User'} />
											<AvatarFallback className="rounded-md text-[10px]">{userInitials}</AvatarFallback>
										</Avatar>
										<span className="truncate text-[13px] font-medium">{user?.name ?? 'User'}</span>
										<ChevronDown className="ml-auto size-3.5 opacity-50" />
									</SidebarMenuButton>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
									side={isMobile ? 'bottom' : 'right'}
									align="start"
									sideOffset={4}
								>
									<div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
										<Avatar className="h-8 w-8 rounded-lg">
											<AvatarImage src={user?.image ?? undefined} alt={user?.name ?? 'User'} />
											<AvatarFallback className="rounded-lg">{userInitials}</AvatarFallback>
										</Avatar>
										<div className="grid flex-1 text-left text-sm leading-tight">
											<span className="truncate font-medium">{user?.name ?? 'User'}</span>
											<span className="truncate text-xs text-muted-foreground">{user?.email}</span>
										</div>
									</div>
									<DropdownMenuSeparator />
									<DropdownMenuItem asChild>
										<Link to="/settings">
											<Settings />
											Settings
										</Link>
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem onClick={() => signOut()}>
										<LogOut />
										Sign out
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</SidebarMenuItem>
					</SidebarMenu>
					{/* Quick action icons (Linear-style) */}
					<div className="flex items-center gap-0.5 pr-2 group-data-[collapsible=icon]:hidden">
						<button
							type="button"
							className="flex size-7 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
							title="Quick capture"
						>
							<PenSquare className="size-4" />
						</button>
					</div>
				</div>
			</SidebarHeader>

			<SidebarContent>
				{/* Main Navigation */}
				<SidebarGroup>
					<SidebarMenu>
						{NAV_ITEMS.map((item, index) => (
							<SidebarMenuItem key={item.to}>
								<SidebarMenuButton
									asChild
									isActive={location.pathname === item.to || (item.to === '/batch/new' && location.pathname === '/')}
									tooltip={item.label}
								>
									<Link
										to={item.to}
										ref={(el) => {
											menuItemsRef.current[index] = el;
										}}
										tabIndex={0}
									>
										<item.icon className="size-4" />
										<span>{item.label}</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>
						))}
					</SidebarMenu>
				</SidebarGroup>

				<SidebarSeparator className="opacity-10" />

				{/* Buckets - Collapsible section (Linear-style) */}
				<SidebarGroup className="group-data-[collapsible=icon]:hidden">
					<Collapsible open={bucketsOpen} onOpenChange={setBucketsOpen}>
						<div className="flex items-center justify-between px-2">
							<CollapsibleTrigger asChild>
								<SidebarGroupLabel className="cursor-pointer hover:text-sidebar-foreground/70 flex-1">
									<ChevronDown className={`mr-1 size-3 transition-transform duration-200 ease-in-out ${bucketsOpen ? '' : '-rotate-90'}`} />
									Buckets
									<span className="ml-auto text-xs text-muted-foreground mr-2">({buckets.length}/20)</span>
								</SidebarGroupLabel>
							</CollapsibleTrigger>

							{/* Quick create bucket button */}
							<Button
								variant="ghost"
								size="icon"
								className="h-5 w-5 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
								onClick={() => setCreateSheetOpen(true)}
							>
								<Plus className="h-3.5 w-3.5" />
								<span className="sr-only">Create bucket</span>
							</Button>
						</div>
						<CollapsibleContent>
							<SidebarMenu role="tree" aria-label="Buckets">
								{buckets.length > 0 ? (
									<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
										<SortableContext items={buckets.map((b) => b.id)} strategy={verticalListSortingStrategy}>
											{buckets.map((bucket, index) => (
												<SidebarBucketItem
													key={bucket.id}
													bucket={bucket}
													onEdit={() => handleEditBucket(bucket.id)}
													onColorChange={(color) => handleColorChange(bucket.id, color)}
													onIconChange={(icon) => handleIconChange(bucket.id, icon)}
													onNameChange={(name) => handleNameChange(bucket.id, name)}
													onExport={() => handleExportBucket(bucket.id)}
													onDelete={() => handleDeleteBucket(bucket.id)}
													onQuickAdd={() => handleQuickAdd(bucket.slug)}
													ref={(el) => {
														menuItemsRef.current[NAV_ITEMS.length + index] = el;
													}}
												/>
											))}
										</SortableContext>
									</DndContext>
								) : (
									<SidebarMenuItem>
										<SidebarMenuButton disabled className="text-sidebar-foreground/50">
											<FolderOpen className="size-4" />
											<span>No buckets yet</span>
										</SidebarMenuButton>
									</SidebarMenuItem>
								)}
							</SidebarMenu>
						</CollapsibleContent>
					</Collapsible>
				</SidebarGroup>

				<SidebarSeparator className="opacity-10" />

				{/* Utilities - Collapsible section */}
				<SidebarGroup className="group-data-[collapsible=icon]:hidden">
					<SidebarGroupLabel>Tools</SidebarGroupLabel>
					<SidebarMenu>
						{UTILITY_ITEMS.map((item, index) => (
							<SidebarMenuItem key={item.to}>
								<SidebarMenuButton asChild isActive={location.pathname === item.to} tooltip={item.label}>
									<Link
										to={item.to}
										ref={(el) => {
											menuItemsRef.current[NAV_ITEMS.length + buckets.length + index] = el;
										}}
										tabIndex={0}
									>
										<item.icon className="size-4" />
										<span>{item.label}</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>
						))}
					</SidebarMenu>
				</SidebarGroup>
			</SidebarContent>

			<SidebarRail />

			{/* Delete confirmation dialog */}
			<Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && closeDeleteDialog()}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete Bucket</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete <strong className="text-foreground">{deleteTarget?.name}</strong>?
						</DialogDescription>
					</DialogHeader>

					{deleteTarget && deleteTarget.senseCount > 0 && (
						<Alert className="bg-yellow-900/20 border-yellow-800">
							<AlertDescription className="text-yellow-300">
								This bucket contains {deleteTarget.senseCount} item{deleteTarget.senseCount !== 1 ? 's' : ''}. You must move or delete all items
								before deleting the bucket.
							</AlertDescription>
						</Alert>
					)}

					{deleteError && (
						<Alert variant="destructive">
							<AlertDescription>{deleteError}</AlertDescription>
						</Alert>
					)}

					<DialogFooter>
						<DialogClose asChild>
							<Button variant="ghost" disabled={deleteBucketMutation.isPending}>
								Cancel
							</Button>
						</DialogClose>
						<Button
							variant="destructive"
							onClick={confirmDelete}
							disabled={deleteBucketMutation.isPending || (deleteTarget?.senseCount ?? 0) > 0}
						>
							{deleteBucketMutation.isPending ? 'Deleting...' : 'Delete Bucket'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Create bucket sheet */}
			<BucketCreateSheet open={createSheetOpen} onOpenChange={setCreateSheetOpen} />

			{/* Edit bucket sheet */}
			<BucketEditSheet bucket={editTarget} open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)} />
		</Sidebar>
	);
}

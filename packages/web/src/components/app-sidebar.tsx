import { closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { ChevronDown, FileDown, FileUp, FolderOpen, LayoutDashboard, LogOut, Plus, Settings, Shield } from 'lucide-react';
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
	{ to: '/batch', label: 'Capture', icon: Plus, shortcut: 'C' },
] as const;

const UTILITY_ITEMS = [
	{ to: '/import', label: 'Import', icon: FileDown, shortcut: 'G I' },
	{ to: '/export', label: 'Export', icon: FileUp, shortcut: 'G E' },
	{ to: '/privacy', label: 'Privacy', icon: Shield, shortcut: undefined },
] as const;

function useSidebarKeyboardNav({
	totalNavItems,
	totalBucketItems,
	totalUtilityItems,
	menuItemsRef,
	focusedItemIndex,
	setFocusedItemIndex,
	disabled,
}: {
	totalNavItems: number;
	totalBucketItems: number;
	totalUtilityItems: number;
	menuItemsRef: React.RefObject<(HTMLAnchorElement | null)[]>;
	focusedItemIndex: number;
	setFocusedItemIndex: React.Dispatch<React.SetStateAction<number>>;
	disabled: boolean;
}) {
	React.useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement;
			const isEditing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
			if (isEditing || disabled) return;

			const totalItems = totalNavItems + totalBucketItems + totalUtilityItems;

			switch (event.key) {
				case 'ArrowDown':
					event.preventDefault();
					setFocusedItemIndex((prev) => {
						const next = prev < totalItems - 1 ? prev + 1 : 0;
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
	}, [focusedItemIndex, totalNavItems, totalBucketItems, totalUtilityItems, menuItemsRef, setFocusedItemIndex, disabled]);
}

function useBucketActions(buckets: UserBucket[], navigate: ReturnType<typeof useNavigate>) {
	const [editTarget, setEditTarget] = React.useState<UserBucket | null>(null);
	const [deleteTarget, setDeleteTarget] = React.useState<UserBucket | null>(null);
	const [deleteError, setDeleteError] = React.useState<string | null>(null);

	const updateBucketMutation = useUpdateBucket();
	const deleteBucketMutation = useDeleteBucket();
	const reorderBucketsMutation = useReorderBuckets();

	const handleEditBucket = (bucketId: string) => {
		const bucket = buckets.find((b) => b.id === bucketId);
		if (bucket) setEditTarget(bucket);
	};

	const handleIconChange = async (bucketId: string, icon: string | null) => {
		await updateBucketMutation.mutateAsync({ id: bucketId, input: { icon } });
	};

	const handleNameChange = async (bucketId: string, name: string) => {
		await updateBucketMutation.mutateAsync({ id: bucketId, input: { name } });
	};

	const handleExportBucket = (bucketId: string) => {
		const bucket = buckets.find((b) => b.id === bucketId);
		if (bucket) {
			navigate({ to: '/export' });
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

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;

		if (!over || active.id === over.id) return;

		const oldIndex = buckets.findIndex((b) => b.id === active.id);
		const newIndex = buckets.findIndex((b) => b.id === over.id);

		if (oldIndex === -1 || newIndex === -1) return;

		const reorderedBuckets = [...buckets];
		const [removed] = reorderedBuckets.splice(oldIndex, 1);
		reorderedBuckets.splice(newIndex, 0, removed);

		try {
			await reorderBucketsMutation.mutateAsync(reorderedBuckets.map((b) => b.id));
		} catch (_error) {
			toast.error('Failed to reorder buckets');
		}
	};

	return {
		editTarget,
		setEditTarget,
		deleteTarget,
		deleteError,
		deleteBucketMutation,
		handleEditBucket,
		handleIconChange,
		handleNameChange,
		handleExportBucket,
		handleDeleteBucket,
		confirmDelete,
		closeDeleteDialog,
		handleDragEnd,
	};
}

function BucketDeleteDialog({
	deleteTarget,
	deleteError,
	isPending,
	onConfirm,
	onClose,
}: {
	deleteTarget: UserBucket | null;
	deleteError: string | null;
	isPending: boolean;
	onConfirm: () => void;
	onClose: () => void;
}) {
	return (
		<Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && onClose()}>
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
						<Button variant="ghost" disabled={isPending}>
							Cancel
						</Button>
					</DialogClose>
					<Button variant="destructive" onClick={onConfirm} disabled={isPending || (deleteTarget?.senseCount ?? 0) > 0}>
						{isPending ? 'Deleting...' : 'Delete Bucket'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const location = useLocation();
	const navigate = useNavigate();
	const { data: session } = useAuth();
	const { data: bucketsData } = useUserBuckets({ enabled: !!session });
	const buckets = bucketsData?.buckets ?? [];
	const { isMobile } = useSidebar();
	const [bucketsOpen, setBucketsOpen] = React.useState(true);
	const [createSheetOpen, setCreateSheetOpen] = React.useState(false);
	const [focusedItemIndex, setFocusedItemIndex] = React.useState<number>(-1);
	const menuItemsRef = React.useRef<(HTMLAnchorElement | null)[]>([]);

	const bucketActions = useBucketActions(buckets, navigate);

	// DnD sensors for drag-and-drop
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8,
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

	// Keyboard navigation for sidebar items
	useSidebarKeyboardNav({
		totalNavItems: NAV_ITEMS.length,
		totalBucketItems: bucketsOpen ? buckets.length : 0,
		totalUtilityItems: UTILITY_ITEMS.length,
		menuItemsRef,
		focusedItemIndex,
		setFocusedItemIndex,
		disabled: bucketActions.deleteTarget !== null || bucketActions.editTarget !== null || createSheetOpen,
	});

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
									isActive={location.pathname === item.to || (item.to === '/batch' && location.pathname === '/')}
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
									<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={bucketActions.handleDragEnd}>
										<SortableContext items={buckets.map((b) => b.id)} strategy={verticalListSortingStrategy}>
											{buckets.map((bucket, index) => (
												<SidebarBucketItem
													key={bucket.id}
													bucket={bucket}
													onEdit={() => bucketActions.handleEditBucket(bucket.id)}
													onIconChange={(icon) => bucketActions.handleIconChange(bucket.id, icon)}
													onNameChange={(name) => bucketActions.handleNameChange(bucket.id, name)}
													onExport={() => bucketActions.handleExportBucket(bucket.id)}
													onDelete={() => bucketActions.handleDeleteBucket(bucket.id)}
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
			<BucketDeleteDialog
				deleteTarget={bucketActions.deleteTarget}
				deleteError={bucketActions.deleteError}
				isPending={bucketActions.deleteBucketMutation.isPending}
				onConfirm={bucketActions.confirmDelete}
				onClose={bucketActions.closeDeleteDialog}
			/>

			{/* Create bucket sheet */}
			<BucketCreateSheet open={createSheetOpen} onOpenChange={setCreateSheetOpen} />

			{/* Edit bucket sheet */}
			<BucketEditSheet
				bucket={bucketActions.editTarget}
				open={bucketActions.editTarget !== null}
				onOpenChange={(open) => !open && bucketActions.setEditTarget(null)}
			/>
		</Sidebar>
	);
}

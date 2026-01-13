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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
	useSidebar,
} from '@/components/ui/sidebar';
import { signOut, useAuth } from '@/features/auth';
import { useDeleteBucket, useUpdateBucket, useUserBuckets } from '@/features/settings';
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

	const updateBucketMutation = useUpdateBucket();
	const deleteBucketMutation = useDeleteBucket();

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
		// TODO: Open edit sheet/modal
		console.log('Edit bucket:', bucketId);
	};

	const handleColorChange = async (bucketId: string, color: string | null) => {
		try {
			await updateBucketMutation.mutateAsync({ id: bucketId, input: { color } });
			toast.success('Bucket color updated');
		} catch (_error) {
			toast.error('Failed to update color');
		}
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

		if (bucket.senseCount > 0) {
			toast.error(`Cannot delete bucket with ${bucket.senseCount} items`);
			return;
		}

		// TODO: Replace with proper confirmation dialog
		const confirmed = window.confirm(`Delete "${bucket.name}"?`);
		if (confirmed) {
			deleteBucketMutation.mutate(bucketId, {
				onSuccess: () => toast.success('Bucket deleted'),
				onError: () => toast.error('Failed to delete bucket'),
			});
		}
	};

	const handleQuickAdd = (bucketSlug: string) => {
		// Navigate to capture page with bucket pre-selected
		navigate({ to: '/batch/new', search: { bucket: bucketSlug } });
	};

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
						{NAV_ITEMS.map((item) => (
							<SidebarMenuItem key={item.to}>
								<SidebarMenuButton
									asChild
									isActive={location.pathname === item.to || (item.to === '/batch/new' && location.pathname === '/')}
									tooltip={item.label}
								>
									<Link to={item.to}>
										<item.icon className="size-4" />
										<span>{item.label}</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>
						))}
					</SidebarMenu>
				</SidebarGroup>

				{/* Buckets - Collapsible section (Linear-style) */}
				<SidebarGroup className="group-data-[collapsible=icon]:hidden">
					<Collapsible open={bucketsOpen} onOpenChange={setBucketsOpen}>
						<div className="flex items-center justify-between px-2">
							<CollapsibleTrigger asChild>
								<SidebarGroupLabel className="cursor-pointer hover:text-sidebar-foreground/70 flex-1">
									<ChevronDown className={`mr-1 size-3 transition-transform duration-200 ${bucketsOpen ? '' : '-rotate-90'}`} />
									Buckets
									<span className="ml-auto text-xs text-muted-foreground mr-2">({buckets.length}/20)</span>
								</SidebarGroupLabel>
							</CollapsibleTrigger>

							{/* Quick create bucket button */}
							<Button
								variant="ghost"
								size="icon"
								className="h-5 w-5 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
								onClick={() => {
									// TODO: Open create bucket sheet
									console.log('Create new bucket');
								}}
							>
								<Plus className="h-3.5 w-3.5" />
								<span className="sr-only">Create bucket</span>
							</Button>
						</div>
						<CollapsibleContent>
							<SidebarMenu>
								{buckets.length > 0 ? (
									buckets.map((bucket) => (
										<SidebarBucketItem
											key={bucket.id}
											bucket={bucket}
											onEdit={() => handleEditBucket(bucket.id)}
											onColorChange={(color) => handleColorChange(bucket.id, color)}
											onExport={() => handleExportBucket(bucket.id)}
											onDelete={() => handleDeleteBucket(bucket.id)}
											onQuickAdd={() => handleQuickAdd(bucket.slug)}
										/>
									))
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

				{/* Utilities - Collapsible section */}
				<SidebarGroup className="group-data-[collapsible=icon]:hidden">
					<SidebarGroupLabel>Tools</SidebarGroupLabel>
					<SidebarMenu>
						{UTILITY_ITEMS.map((item) => (
							<SidebarMenuItem key={item.to}>
								<SidebarMenuButton asChild isActive={location.pathname === item.to} tooltip={item.label}>
									<Link to={item.to}>
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
		</Sidebar>
	);
}

import { Link, useLocation } from '@tanstack/react-router';
import { Archive, FileDown, FileUp, FolderOpen, LogOut, Plus, Search, Settings } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { useUserBuckets } from '@/features/settings';

const NAV_ITEMS = [
	{ to: '/search', label: 'Search', icon: Search, shortcut: '/' },
	{ to: '/batch/new', label: 'Capture', icon: Plus, shortcut: 'C' },
	{ to: '/batch', label: 'Batches', icon: Archive, shortcut: 'G B' },
] as const;

const UTILITY_ITEMS = [
	{ to: '/import', label: 'Import', icon: FileDown, shortcut: 'G I' },
	{ to: '/export', label: 'Export', icon: FileUp, shortcut: 'G E' },
] as const;

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const location = useLocation();
	const { data: session } = useAuth();
	const { data: bucketsData } = useUserBuckets({ enabled: !!session });
	const buckets = bucketsData?.buckets ?? [];
	const { isMobile } = useSidebar();

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

	return (
		<Sidebar collapsible="icon" {...props}>
			{/* User Menu Header (Linear-style) */}
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
									<Avatar className="h-8 w-8 rounded-lg">
										<AvatarImage src={user?.image ?? undefined} alt={user?.name ?? 'User'} />
										<AvatarFallback className="rounded-lg">{userInitials}</AvatarFallback>
									</Avatar>
									<div className="grid flex-1 text-left text-sm leading-tight">
										<span className="truncate font-medium">{user?.name ?? 'User'}</span>
									</div>
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
										<item.icon />
										<span>{item.label}</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>
						))}
					</SidebarMenu>
				</SidebarGroup>

				<SidebarSeparator />

				{/* Buckets */}
				<SidebarGroup className="group-data-[collapsible=icon]:hidden">
					<SidebarGroupLabel>Buckets</SidebarGroupLabel>
					<SidebarMenu>
						{buckets.length > 0 ? (
							buckets.map((bucket) => (
								<SidebarMenuItem key={bucket.id}>
									<SidebarMenuButton asChild isActive={location.pathname === `/bucket/${bucket.slug}`}>
										<Link to="/bucket/$slug" params={{ slug: bucket.slug }} search={{ term: undefined }}>
											<FolderOpen />
											<span>{bucket.name}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))
						) : (
							<SidebarMenuItem>
								<SidebarMenuButton disabled className="text-sidebar-foreground/50">
									<FolderOpen />
									<span>No buckets yet</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						)}
					</SidebarMenu>
				</SidebarGroup>

				<SidebarSeparator className="group-data-[collapsible=icon]:hidden" />

				{/* Utilities */}
				<SidebarGroup>
					<SidebarMenu>
						{UTILITY_ITEMS.map((item) => (
							<SidebarMenuItem key={item.to}>
								<SidebarMenuButton asChild isActive={location.pathname === item.to} tooltip={item.label}>
									<Link to={item.to}>
										<item.icon />
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

import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { Archive, FileDown, FileUp, FolderOpen, LogOut, Plus, Search, Settings } from 'lucide-react';
import * as React from 'react';
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
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInput,
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
	{ to: '/batch/new', label: 'Capture', icon: Plus, shortcut: 'C' },
	{ to: '/batch', label: 'Batches', icon: Archive, shortcut: 'G B' },
] as const;

const UTILITY_ITEMS = [
	{ to: '/import', label: 'Import', icon: FileDown, shortcut: 'G I' },
	{ to: '/export', label: 'Export', icon: FileUp, shortcut: 'G E' },
] as const;

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const location = useLocation();
	const navigate = useNavigate();
	const { data: session } = useAuth();
	const { data: bucketsData } = useUserBuckets({ enabled: !!session });
	const buckets = bucketsData?.buckets ?? [];
	const { isMobile } = useSidebar();
	const searchInputRef = React.useRef<HTMLInputElement>(null);
	const [searchQuery, setSearchQuery] = React.useState('');

	// Expose the search input ref for external focus (via "/" shortcut)
	React.useEffect(() => {
		// @ts-expect-error - attaching ref to window for global access
		window.__sidebarSearchRef = searchInputRef;
		return () => {
			// @ts-expect-error - cleanup
			delete window.__sidebarSearchRef;
		};
	}, []);

	const handleSearchSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (searchQuery.trim()) {
			navigate({ to: '/search', search: { q: searchQuery.trim() } });
		}
	};

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
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild>
							<Link to="/batch/new">
								<div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg font-semibold">
									a
								</div>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-semibold">append</span>
									<span className="truncate text-xs text-sidebar-foreground/70">Capture everything</span>
								</div>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>

			<SidebarContent>
				{/* Search */}
				<SidebarGroup className="py-0 group-data-[collapsible=icon]:hidden">
					<form onSubmit={handleSearchSubmit}>
						<div className="relative">
							<Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
							<SidebarInput
								ref={searchInputRef}
								type="search"
								placeholder="Search..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="pl-8"
							/>
						</div>
					</form>
				</SidebarGroup>

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
										<Link to="/bucket/$slug" params={{ slug: bucket.slug }}>
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

			<SidebarFooter>
				<SidebarMenu>
					{/* Settings */}
					<SidebarMenuItem>
						<SidebarMenuButton asChild isActive={location.pathname === '/settings'} tooltip="Settings">
							<Link to="/settings">
								<Settings />
								<span>Settings</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>

					{/* User Menu */}
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
										<span className="truncate text-xs">{user?.email}</span>
									</div>
								</SidebarMenuButton>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
								side={isMobile ? 'bottom' : 'right'}
								align="end"
								sideOffset={4}
							>
								<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
									<Avatar className="h-8 w-8 rounded-lg">
										<AvatarImage src={user?.image ?? undefined} alt={user?.name ?? 'User'} />
										<AvatarFallback className="rounded-lg">{userInitials}</AvatarFallback>
									</Avatar>
									<div className="grid flex-1 text-left text-sm leading-tight">
										<span className="truncate font-medium">{user?.name ?? 'User'}</span>
										<span className="truncate text-xs">{user?.email}</span>
									</div>
								</div>
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={() => signOut()}>
									<LogOut />
									Sign out
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>

			<SidebarRail />
		</Sidebar>
	);
}

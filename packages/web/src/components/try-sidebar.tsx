import { Link, useLocation } from '@tanstack/react-router';
import { LayoutDashboard, Plus } from 'lucide-react';
import type * as React from 'react';
import { Badge } from '@/components/ui/badge';
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
} from '@/components/ui/sidebar';
import { useTryBuckets } from '@/features/try/hooks';

export function TrySidebar(props: React.ComponentProps<typeof Sidebar>) {
	const location = useLocation();
	const { buckets } = useTryBuckets();

	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader className="pb-0">
				<div className="flex items-center justify-between gap-2 px-2">
					<div className="flex min-w-0 items-center gap-2">
						<span className="truncate text-[13px] font-semibold">Append</span>
						<Badge variant="outline" className="h-5 shrink-0 rounded-md px-1.5 text-[10px]">
							TRY
						</Badge>
					</div>
				</div>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Trial</SidebarGroupLabel>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton asChild isActive={location.pathname === '/try'} tooltip="Capture">
								<Link to="/try">
									<Plus className="size-4" />
									<span>Capture</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarGroup>

				<SidebarGroup>
					<SidebarGroupLabel>Buckets</SidebarGroupLabel>
					<SidebarMenu>
						{buckets.map((b) => (
							<SidebarMenuItem key={b.slug}>
								<SidebarMenuButton asChild isActive={location.pathname === `/try/bucket/${b.slug}`} tooltip={b.name}>
									<Link to="/try/bucket/$slug" params={{ slug: b.slug }} search={{ term: undefined }}>
										<LayoutDashboard className="size-4" />
										<span>{b.name}</span>
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

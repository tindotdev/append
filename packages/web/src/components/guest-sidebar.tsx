import { Link, useLocation } from '@tanstack/react-router';
import { ExternalLink, LayoutDashboard } from 'lucide-react';
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

export function GuestSidebar({ extensionDownloadUrl }: React.ComponentProps<typeof Sidebar> & { extensionDownloadUrl?: string }) {
	const location = useLocation();

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader className="pb-0">
				<div className="flex items-center justify-between gap-2 px-2">
					<div className="flex min-w-0 items-center gap-2">
						<span className="truncate text-[13px] font-semibold">Append</span>
						<Badge variant="outline" className="h-5 shrink-0 rounded-md px-1.5 text-[10px]">
							DEMO
						</Badge>
					</div>
				</div>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Demo</SidebarGroupLabel>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton asChild isActive={location.pathname === '/demo'} tooltip="Dashboard">
								<Link to="/demo">
									<LayoutDashboard className="size-4" />
									<span>Dashboard</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
						<SidebarMenuItem>
							<SidebarMenuButton asChild={!!extensionDownloadUrl} disabled={!extensionDownloadUrl} tooltip="Install extension">
								{extensionDownloadUrl ? (
									<a href={extensionDownloadUrl} target="_blank" rel="noreferrer">
										<ExternalLink className="size-4" />
										<span>Install extension</span>
									</a>
								) : (
									<span className="flex items-center gap-2">
										<ExternalLink className="size-4" />
										<span>Install extension</span>
									</span>
								)}
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarGroup>
			</SidebarContent>

			<SidebarRail />
		</Sidebar>
	);
}

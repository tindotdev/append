import { Outlet } from '@tanstack/react-router';
import { Info } from 'lucide-react';
import { DemoFab } from '@/components/demo/DemoFab';
import { GuestSidebar } from '@/components/guest-sidebar';
import { Button } from '@/components/ui/button';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { DashboardDataModeProvider } from '@/features/dashboard/context/dashboard-data-mode';
import { demoConfig } from '@/lib/demo-config';

export function GuestShell() {
	return (
		<DashboardDataModeProvider mode="local">
			<SidebarProvider>
				<GuestSidebar extensionDownloadUrl={demoConfig.extensionDownloadUrl} />
				<SidebarInset>
					<header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-800 px-4">
						<SidebarTrigger className="-ml-1" />
						<div className="ml-auto flex items-center gap-2">
							<div className="hidden items-center gap-2 text-xs text-zinc-400 sm:flex">
								<Info className="size-3.5" />
								Synthetic data • nothing is saved
							</div>
							{demoConfig.extensionDownloadUrl ? (
								<Button variant="outline" size="sm" asChild>
									<a href={demoConfig.extensionDownloadUrl} target="_blank" rel="noreferrer">
										Get the extension
									</a>
								</Button>
							) : null}
						</div>
					</header>

					<main className="flex-1 overflow-auto p-6">
						<div className="mx-auto max-w-7xl">
							<Outlet />
						</div>
					</main>
				</SidebarInset>

				<DemoFab />
			</SidebarProvider>
		</DashboardDataModeProvider>
	);
}

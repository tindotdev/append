import { Outlet, useNavigate } from '@tanstack/react-router';
import { FolderOpen, Plus, Search, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { useAuth } from '@/features/auth';
import { useUserBuckets } from '@/features/settings';

export function AppShell() {
	const { data: session, isPending } = useAuth();
	const navigate = useNavigate();
	const [commandOpen, setCommandOpen] = useState(false);

	const isAuthenticated = !!session;

	// Fetch user buckets for command palette
	const { data: bucketsData } = useUserBuckets({ enabled: isAuthenticated });
	const buckets = bucketsData?.buckets ?? [];

	// Redirect to sign-in when auth resolves to unauthenticated
	useEffect(() => {
		if (!isPending && !isAuthenticated) {
			navigate({ to: '/sign-in' });
		}
	}, [isPending, isAuthenticated, navigate]);

	// Global keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Skip if user is typing in an input/textarea
			const target = e.target as HTMLElement;
			const isEditing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

			// Cmd+K opens command palette (always works)
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				setCommandOpen((open) => !open);
				return;
			}

			// Navigation shortcuts only work when not editing
			if (!isEditing && !e.metaKey && !e.ctrlKey && !e.altKey) {
				switch (e.key.toLowerCase()) {
					case 'c':
						e.preventDefault();
						navigate({ to: '/batch/new' });
						break;
					case '/':
						e.preventDefault();
						navigate({ to: '/search' });
						break;
				}
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [navigate]);

	// Show loading while auth is pending or redirecting
	if (isPending || !isAuthenticated) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<p className="text-zinc-400">Loading...</p>
			</div>
		);
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-800 px-4">
					<SidebarTrigger className="-ml-1" />
					<div className="flex-1" />
					<button
						type="button"
						onClick={() => setCommandOpen(true)}
						className="hidden sm:flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300 transition-colors"
					>
						<Search className="size-3.5" />
						<span>Search</span>
						<Kbd>⌘K</Kbd>
					</button>
				</header>

				<main className="flex-1 overflow-auto p-6">
					<Outlet />
				</main>
			</SidebarInset>

			{/* Command palette (Cmd+K) */}
			<CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
				<CommandInput placeholder="Type to search..." />
				<CommandList>
					<CommandEmpty>No results found.</CommandEmpty>
					<CommandGroup heading="Navigation">
						<CommandItem
							onSelect={() => {
								navigate({ to: '/batch/new' });
								setCommandOpen(false);
							}}
						>
							<Plus className="mr-2 size-4" />
							Capture
							<Kbd className="ml-auto">C</Kbd>
						</CommandItem>
						<CommandItem
							onSelect={() => {
								navigate({ to: '/search' });
								setCommandOpen(false);
							}}
						>
							<Search className="mr-2 size-4" />
							Search
							<Kbd className="ml-auto">/</Kbd>
						</CommandItem>
						<CommandItem
							onSelect={() => {
								navigate({ to: '/settings' });
								setCommandOpen(false);
							}}
						>
							<Settings className="mr-2 size-4" />
							Settings
						</CommandItem>
					</CommandGroup>
					{buckets.length > 0 && (
						<>
							<CommandSeparator />
							<CommandGroup heading="Buckets">
								{buckets.map((bucket) => (
									<CommandItem
										key={bucket.id}
										onSelect={() => {
											navigate({ to: '/bucket/$slug', params: { slug: bucket.slug } });
											setCommandOpen(false);
										}}
									>
										<FolderOpen className="mr-2 size-4" />
										{bucket.name}
									</CommandItem>
								))}
							</CommandGroup>
						</>
					)}
				</CommandList>
			</CommandDialog>
		</SidebarProvider>
	);
}

import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { ChevronDown, FolderOpen, Menu, Plus, Search, Settings } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { signOut, useAuth } from '@/features/auth';
import { useUserBuckets } from '@/features/settings';
import { CAPTURE_NAV, HEADER_NAV, NAV_LINKS } from '@/lib/navigation';
import { NavLink } from '../NavLink';
import { Button } from '../ui/button';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '../ui/command';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Kbd } from '../ui/kbd';

export function ProtectedLayout() {
	// Use AuthProvider (reactive); router context isn't reactive when RouterProvider context changes.
	const { data: session, isPending } = useAuth();
	const navigate = useNavigate();
	const [commandOpen, setCommandOpen] = useState(false);

	const isAuthenticated = !!session;
	const email = session?.user?.email ?? null;

	// Fetch user buckets for dynamic menu (only when authenticated)
	const { data: bucketsData } = useUserBuckets({ enabled: isAuthenticated });
	const buckets = bucketsData?.buckets ?? [];

	const shortEmail = useMemo(() => {
		if (!email) return null;
		const [user, domain] = email.split('@');
		if (!user || !domain) return email;
		return `${user}@${domain}`;
	}, [email]);

	// Redirect to sign-in when auth resolves to unauthenticated
	useEffect(() => {
		if (!isPending && !isAuthenticated) {
			navigate({ to: '/sign-in' });
		}
	}, [isPending, isAuthenticated, navigate]);

	// Global Cmd+K keyboard shortcut
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				setCommandOpen((open) => !open);
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, []);

	// Show loading while auth is pending or redirecting
	if (isPending || !isAuthenticated) {
		return (
			<div className="min-h-screen p-8">
				<p className="text-zinc-400">Loading...</p>
			</div>
		);
	}

	return (
		<div className="min-h-dvh">
			<a
				href="#content"
				className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 rounded-md bg-zinc-900 px-3 py-2 text-sm text-zinc-100 ring-1 ring-zinc-700"
			>
				Skip to content
			</a>

			<header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/85 backdrop-blur">
				<div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
					<div className="flex items-center gap-3">
						<Link
							to={CAPTURE_NAV.to}
							className="text-sm font-semibold tracking-wide text-zinc-100 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-200/40 rounded-sm"
						>
							append
						</Link>

						<div className="sm:hidden">
							<DropdownMenu>
								<DropdownMenuTrigger className="rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900/60 hover:text-zinc-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-200/40">
									<span className="inline-flex items-center gap-2">
										<Menu className="size-4" />
										Menu
										<ChevronDown className="size-3 text-zinc-500" />
									</span>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="start" className="w-64">
									{NAV_LINKS.map((link) => (
										<DropdownMenuItem key={link.to} asChild>
											<Link to={link.to}>{link.label}</Link>
										</DropdownMenuItem>
									))}
									{buckets.length > 0 && (
										<>
											<DropdownMenuSeparator />
											<DropdownMenuLabel className="text-xs text-zinc-500">Buckets</DropdownMenuLabel>
											{buckets.map((b) => (
												<DropdownMenuItem key={b.id} asChild>
													<Link to="/bucket/$slug" params={{ slug: b.slug }}>
														{b.name}
													</Link>
												</DropdownMenuItem>
											))}
										</>
									)}
								</DropdownMenuContent>
							</DropdownMenu>
						</div>

						<div className="hidden sm:flex items-center gap-1">
							<DropdownMenu>
								<DropdownMenuTrigger className="rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900/60 hover:text-zinc-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-200/40">
									<span className="inline-flex items-center gap-2">
										Buckets
										<ChevronDown className="size-3 text-zinc-500" />
									</span>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="start" className="w-56">
									{buckets.length > 0 ? (
										buckets.map((b) => (
											<DropdownMenuItem key={b.id} asChild>
												<Link to="/bucket/$slug" params={{ slug: b.slug }}>
													{b.name}
												</Link>
											</DropdownMenuItem>
										))
									) : (
										<DropdownMenuItem disabled>No buckets yet</DropdownMenuItem>
									)}
								</DropdownMenuContent>
							</DropdownMenu>

							{HEADER_NAV.map((link) => (
								<NavLink key={link.to} to={link.to}>
									{link.label}
								</NavLink>
							))}
						</div>
					</div>

					<div className="flex items-center gap-3">
						<Button variant="outline" size="sm" onClick={() => setCommandOpen(true)} className="hidden sm:flex items-center gap-2">
							<Search className="size-3.5" />
							<span>Search</span>
							<Kbd>⌘K</Kbd>
						</Button>
						<NavLink to={CAPTURE_NAV.to}>{CAPTURE_NAV.label}</NavLink>
						{shortEmail && <span className="hidden sm:inline text-xs text-zinc-500">{shortEmail}</span>}
						<Button variant="secondary" size="sm" onClick={() => signOut()}>
							Sign out
						</Button>
					</div>
				</div>
			</header>

			<main className="px-6 py-10">
				<div className="mx-auto w-full max-w-5xl">
					<Outlet />
				</div>
			</main>

			{/* Command palette (Cmd+K) */}
			<CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
				<CommandInput placeholder="Type to search..." />
				<CommandList>
					<CommandEmpty>No results found.</CommandEmpty>
					<CommandGroup heading="Navigation">
						<CommandItem
							onSelect={() => {
								navigate({ to: '/' });
								setCommandOpen(false);
							}}
						>
							<Plus className="mr-2 size-4" />
							Capture
						</CommandItem>
						<CommandItem
							onSelect={() => {
								navigate({ to: '/search' });
								setCommandOpen(false);
							}}
						>
							<Search className="mr-2 size-4" />
							Search
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
		</div>
	);
}

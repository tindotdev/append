import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef } from 'react';
import { signOut, useAuth } from '@/features/auth';
import { BUCKETS, CAPTURE_NAV, HEADER_NAV, NAV_LINKS } from '@/lib/navigation';
import { NavLink } from '../NavLink';

export function ProtectedLayout() {
	// Use AuthProvider (reactive); router context isn't reactive when RouterProvider context changes.
	const { data: session, isPending } = useAuth();
	const navigate = useNavigate();
	const bucketMenuRef = useRef<HTMLDetailsElement | null>(null);
	const mobileMenuRef = useRef<HTMLDetailsElement | null>(null);

	const isAuthenticated = !!session;
	const email = session?.user?.email ?? null;

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
							<details ref={mobileMenuRef} className="relative">
								<summary className="list-none rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900/60 hover:text-zinc-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-200/40">
									<span className="inline-flex items-center gap-2">
										Menu
										<svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="text-zinc-500">
											<path
												fillRule="evenodd"
												d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.25a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
												clipRule="evenodd"
											/>
										</svg>
									</span>
								</summary>
								<div className="absolute left-0 mt-2 w-64 rounded-lg border border-zinc-800 bg-zinc-950 shadow-lg shadow-black/30">
									<div className="p-1">
										{NAV_LINKS.map((link) => (
											<Link
												key={link.to}
												to={link.to}
												onClick={() => mobileMenuRef.current?.removeAttribute('open')}
												className="block rounded-md px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-200/40"
											>
												{link.label}
											</Link>
										))}
									</div>
									<div className="border-t border-zinc-800 p-1">
										<p className="px-3 py-2 text-xs text-zinc-500">Buckets</p>
										{BUCKETS.map((b) => (
											<Link
												key={b.slug}
												to="/bucket/$slug"
												params={{ slug: b.slug }}
												onClick={() => mobileMenuRef.current?.removeAttribute('open')}
												className="block rounded-md px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-200/40"
											>
												{b.label}
											</Link>
										))}
									</div>
								</div>
							</details>
						</div>

						<div className="hidden sm:flex items-center gap-1">
							<details ref={bucketMenuRef} className="relative">
								<summary className="list-none rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900/60 hover:text-zinc-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-200/40">
									<span className="inline-flex items-center gap-2">
										Buckets
										<svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="text-zinc-500">
											<path
												fillRule="evenodd"
												d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.25a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
												clipRule="evenodd"
											/>
										</svg>
									</span>
								</summary>
								<div className="absolute left-0 mt-2 w-56 rounded-lg border border-zinc-800 bg-zinc-950 shadow-lg shadow-black/30">
									<div className="p-1">
										{BUCKETS.map((b) => (
											<Link
												key={b.slug}
												to="/bucket/$slug"
												params={{ slug: b.slug }}
												onClick={() => bucketMenuRef.current?.removeAttribute('open')}
												className="block rounded-md px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-200/40"
											>
												{b.label}
											</Link>
										))}
									</div>
								</div>
							</details>

							{HEADER_NAV.map((link) => (
								<NavLink key={link.to} to={link.to}>
									{link.label}
								</NavLink>
							))}
						</div>
					</div>

					<div className="flex items-center gap-3">
						<NavLink to={CAPTURE_NAV.to}>{CAPTURE_NAV.label}</NavLink>
						{shortEmail && <span className="hidden sm:inline text-xs text-zinc-500">{shortEmail}</span>}
						<button
							type="button"
							onClick={() => signOut()}
							className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-200/40"
						>
							Sign out
						</button>
					</div>
				</div>
			</header>

			<main className="px-6 py-10">
				<div className="mx-auto w-full max-w-5xl">
					<Outlet />
				</div>
			</main>
		</div>
	);
}

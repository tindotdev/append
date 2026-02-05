import { createFileRoute, Link, Outlet } from '@tanstack/react-router';

/**
 * Public legal pages layout (privacy, terms).
 * No authentication required.
 */
export const Route = createFileRoute('/_legal')({
	component: LegalShell,
});

function LegalShell() {
	return (
		<div className="flex min-h-screen flex-col bg-muted/40">
			<header className="border-b border-border bg-background/80 backdrop-blur-sm">
				<div className="mx-auto flex h-12 max-w-3xl items-center justify-between px-6">
					<Link to="/sign-in" className="flex items-center gap-2">
						<img src="/android-chrome-192x192.png" alt="append logo" className="h-6 w-6 rounded" />
						<span className="text-sm font-medium">append</span>
					</Link>
					<nav className="flex items-center gap-4 text-xs text-muted-foreground">
						<Link to="/privacy" className="hover:text-foreground [&.active]:text-foreground">
							Privacy
						</Link>
						<Link to="/terms" className="hover:text-foreground [&.active]:text-foreground">
							Terms
						</Link>
					</nav>
				</div>
			</header>

			<main className="flex-1 px-6 py-8">
				<div className="mx-auto max-w-3xl">
					<Outlet />
				</div>
			</main>

			<footer className="border-t border-border py-6">
				<div className="mx-auto max-w-3xl px-6 text-center text-xs text-muted-foreground">
					<p>&copy; {new Date().getFullYear()} append. All rights reserved.</p>
				</div>
			</footer>
		</div>
	);
}

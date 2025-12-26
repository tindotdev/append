import { Link } from '@tanstack/react-router';
import type { NavRoute } from '@/lib/navigation';

export function NavLink({ to, children }: { to: NavRoute; children: React.ReactNode }) {
	return (
		<Link
			to={to}
			className="rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900/60 hover:text-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-200/40"
		>
			{children}
		</Link>
	);
}

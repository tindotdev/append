export function SearchPage() {
	return (
		<div className="max-w-2xl">
			<h2 className="text-xl font-semibold">Search</h2>
			<p className="mt-2 text-zinc-400">Coming soon. This will search across terms and senses.</p>

			<div className="mt-6">
				<label htmlFor="search" className="block text-sm text-zinc-400">
					Query
				</label>
				<input
					id="search"
					disabled
					placeholder="Search…"
					className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-2.5 text-zinc-200 placeholder:text-zinc-600 opacity-60"
				/>
				<p className="mt-2 text-xs text-zinc-500">Placeholder UI only (not wired up yet).</p>
			</div>
		</div>
	);
}

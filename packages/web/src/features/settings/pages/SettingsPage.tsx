/**
 * Settings page with bucket manager.
 */

import { BucketManager } from '../components/BucketManager';

export function SettingsPage() {
	return (
		<div className="max-w-3xl">
			<div className="mb-8">
				<h1 className="text-2xl font-semibold text-zinc-100">Settings</h1>
				<p className="text-zinc-400 mt-1">Manage your buckets and preferences.</p>
			</div>

			<section>
				<BucketManager />
			</section>
		</div>
	);
}

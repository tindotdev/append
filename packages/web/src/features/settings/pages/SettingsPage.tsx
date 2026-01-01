/**
 * Settings page with bucket manager.
 */

import { BucketManager } from '../components/BucketManager';

export function SettingsPage() {
	return (
		<div className="max-w-3xl">
			<div className="mb-6">
				<h2 className="text-xl font-semibold">Settings</h2>
				<p className="text-sm text-zinc-500 mt-1">Manage your buckets and preferences.</p>
			</div>

			<section>
				<BucketManager />
			</section>
		</div>
	);
}

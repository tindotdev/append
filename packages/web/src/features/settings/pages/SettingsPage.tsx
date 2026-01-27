/**
 * Settings page with bucket manager.
 */

import { BucketManager } from '../components/BucketManager';
import { DeviceTokenManager } from '../components/DeviceTokenManager';

export function SettingsPage() {
	return (
		<div className="max-w-3xl">
			<div className="mb-6">
				<h2 className="text-xl font-semibold">Settings</h2>
				<p className="text-sm text-muted-foreground mt-1">Manage your buckets and preferences.</p>
			</div>

			<section className="space-y-8">
				<BucketManager />
				<DeviceTokenManager />
			</section>
		</div>
	);
}

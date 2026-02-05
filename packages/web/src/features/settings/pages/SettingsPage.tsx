/**
 * Settings page with bucket manager.
 */

import { AccountDeletionCard } from '@/components/account/AccountDeletionCard';
import { BucketManager } from '../components/BucketManager';
import { DeviceTokenManager } from '../components/DeviceTokenManager';

export function SettingsPage() {
	return (
		<div className="@container/main w-full">
			{/* Header */}
			<div className="mb-4">
				<h2 className="text-xl font-semibold">Settings</h2>
				<p className="mt-1 text-sm text-muted-foreground">Manage your buckets and preferences.</p>
			</div>

			{/* Settings sections */}
			<div className="space-y-4">
				<BucketManager />
				<DeviceTokenManager />
				<AccountDeletionCard />
			</div>
		</div>
	);
}

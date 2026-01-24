import { InstallInstructionsPanel } from '@/components/demo/InstallInstructionsPanel';
import { DashboardPage } from '@/features/dashboard';
import { demoConfig } from '@/lib/demo-config';

export function DemoDashboardPage() {
	return (
		<div>
			<InstallInstructionsPanel downloadUrl={demoConfig.extensionDownloadUrl} />
			<DashboardPage />
		</div>
	);
}

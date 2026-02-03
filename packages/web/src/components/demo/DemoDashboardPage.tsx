import { InstallInstructionsPanel } from '@/components/demo/InstallInstructionsPanel';
import { DashboardPage } from '@/features/dashboard';
import { demoConfig } from '@/lib/demo-config';

/**
 * Demo dashboard page wrapper.
 *
 * IMPORTANT: This component depends on DashboardDataModeProvider being set to mode="local"
 * in the parent layout (GuestShell). If rendered outside of GuestShell, the DashboardPage
 * will default to "auto" mode, potentially causing unwanted API calls.
 */
export function DemoDashboardPage() {
	return (
		<div>
			<InstallInstructionsPanel downloadUrl={demoConfig.extensionDownloadUrl} />
			<DashboardPage />
		</div>
	);
}

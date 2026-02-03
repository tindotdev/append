import { createFileRoute } from '@tanstack/react-router';
import { GuestShell } from '@/components/layouts/GuestShell';

// Demo route is intentionally public and accessible to both authenticated
// and unauthenticated users. It uses synthetic local data via GuestShell
// to provide a preview of the dashboard without requiring authentication.
export const Route = createFileRoute('/_demo')({
	component: GuestShell,
});

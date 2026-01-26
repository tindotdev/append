import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_protected/batch')({
	component: () => <Outlet />,
});

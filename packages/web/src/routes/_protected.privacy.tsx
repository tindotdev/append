import { createFileRoute } from '@tanstack/react-router';
import { PrivacyPage } from '@/features/privacy';

export const Route = createFileRoute('/_protected/privacy')({
	component: PrivacyPage,
});

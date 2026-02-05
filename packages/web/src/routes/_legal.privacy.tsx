import { createFileRoute } from '@tanstack/react-router';
import { PublicPrivacyPage } from '@/features/privacy/pages/PublicPrivacyPage';

export const Route = createFileRoute('/_legal/privacy')({
	component: PublicPrivacyPage,
});

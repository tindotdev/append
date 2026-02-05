import { createFileRoute } from '@tanstack/react-router';
import { TermsPage } from '@/features/privacy/pages/TermsPage';

export const Route = createFileRoute('/_legal/terms')({
	component: TermsPage,
});

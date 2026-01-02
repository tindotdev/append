import { useQuery } from '@tanstack/react-query';
import { API_URL, buildApiRequestError } from '@/lib/api-rpc';

// Query key factory
export const termKeys = {
	all: ['term'] as const,
	detail: (id: string) => [...termKeys.all, 'detail', id] as const,
};

// Response types (matching backend)
export interface TermDetailResponse {
	term: {
		id: string;
		displayTerm: string;
		canonical: string;
		version: number;
		createdAt: number;
	};
	senses: Array<{
		id: string;
		bucket: string;
		text: string;
		source: string;
		senseLabel: string | null;
		flaggedReason: string | null;
		version: number;
		createdAt: number;
		isPrimary: boolean;
	}>;
}

/**
 * Fetch term details with all senses.
 */
export async function getTerm(termId: string): Promise<TermDetailResponse> {
	const res = await fetch(`${API_URL}/api/term/${termId}`, {
		credentials: 'include',
	});

	if (!res.ok) {
		throw await buildApiRequestError(res);
	}

	return res.json() as Promise<TermDetailResponse>;
}

/**
 * React Query hook for fetching term details.
 */
export function useTermDetail(termId: string | null) {
	return useQuery({
		queryKey: termId ? termKeys.detail(termId) : ['term', 'none'],
		queryFn: () => (termId ? getTerm(termId) : Promise.reject('No term ID')),
		enabled: !!termId,
	});
}

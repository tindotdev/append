import { AlertCircle, Check, ChevronRight, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { BatchListItem, Candidate } from '../types';
import { type CandidateStatus, getCandidateStatus, getEffectiveBucket, getEffectiveText } from './candidate-columns';

interface ExpandedRowContentProps {
	batch: BatchListItem;
	onFetchCandidates?: (batchId: string) => Promise<Candidate[]>;
	onViewDetails?: () => void;
}

const MAX_PREVIEW_CANDIDATES = 10;

function getStatusBadge(status: CandidateStatus) {
	switch (status) {
		case 'ready':
			return (
				<Badge variant="outline" className="text-xs">
					Ready
				</Badge>
			);
		case 'pending':
			return (
				<Badge variant="warning" className="text-xs">
					Pending
				</Badge>
			);
		case 'accepted':
			return (
				<Badge variant="success" className="text-xs">
					<Check className="h-3 w-3 mr-1" />
					Accepted
				</Badge>
			);
		case 'error':
			return (
				<Badge variant="destructive" className="text-xs">
					Error
				</Badge>
			);
	}
}

export function ExpandedRowContent({ batch, onFetchCandidates, onViewDetails }: ExpandedRowContentProps) {
	const [candidates, setCandidates] = useState<Candidate[] | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchCandidates = useCallback(async () => {
		if (!onFetchCandidates) return;

		setIsLoading(true);
		setError(null);

		try {
			const data = await onFetchCandidates(batch.id);
			setCandidates(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load candidates');
		} finally {
			setIsLoading(false);
		}
	}, [batch.id, onFetchCandidates]);

	useEffect(() => {
		fetchCandidates();
	}, [fetchCandidates]);

	if (isLoading) {
		return (
			<div className="border-t border-border bg-card/50 p-4">
				<div className="flex items-center justify-center gap-2 text-muted-foreground">
					<Loader2 className="h-4 w-4 animate-spin" />
					<span className="text-sm">Loading candidates...</span>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="border-t border-border bg-card/50 p-4">
				<div className="flex items-center justify-center gap-2 text-destructive">
					<AlertCircle className="h-4 w-4" />
					<span className="text-sm">{error}</span>
					<Button variant="link" size="sm" onClick={fetchCandidates} className="text-destructive h-auto p-0">
						Retry
					</Button>
				</div>
			</div>
		);
	}

	if (!candidates || candidates.length === 0) {
		return (
			<div className="border-t border-border bg-card/50 p-4">
				<div className="text-center text-muted-foreground text-sm">No candidates in this batch</div>
			</div>
		);
	}

	const previewCandidates = candidates.slice(0, MAX_PREVIEW_CANDIDATES);
	const remainingCount = candidates.length - MAX_PREVIEW_CANDIDATES;

	return (
		<div className="border-t border-border bg-card/50 p-4">
			<div className="space-y-2">
				{previewCandidates.map((candidate) => {
					const status = getCandidateStatus(candidate);
					const bucket = getEffectiveBucket(candidate);
					const text = getEffectiveText(candidate);

					return (
						<div key={candidate.id} className="flex items-center gap-3 text-sm py-1">
							{getStatusBadge(status)}
							<span className="font-medium text-card-foreground">{candidate.term}</span>
							{bucket && (
								<>
									<ChevronRight className="h-3 w-3 text-muted-foreground" />
									<Badge variant="outline" className="text-xs">
										{bucket}
									</Badge>
								</>
							)}
							{text && <span className="text-muted-foreground truncate max-w-[250px]">{text}</span>}
							{status === 'error' && candidate.suggestionError && (
								<span className="text-destructive text-xs truncate max-w-[200px]">{candidate.suggestionError}</span>
							)}
						</div>
					);
				})}
			</div>

			{(remainingCount > 0 || onViewDetails) && (
				<div className="mt-3 pt-3 border-t border-border">
					<Button variant="link" size="sm" onClick={onViewDetails} className="text-muted-foreground hover:text-foreground h-auto p-0">
						View all {candidates.length} candidates
						<ChevronRight className="h-4 w-4 ml-1" />
					</Button>
				</div>
			)}
		</div>
	);
}

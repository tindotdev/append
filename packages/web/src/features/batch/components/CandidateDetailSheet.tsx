import { Check, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import type { Candidate } from '../types';
import { getCandidateStatus, getEffectiveBucket, getEffectiveText } from './candidate-columns';

interface BucketOption {
	slug: string;
	name: string;
}

interface CandidateDetailSheetProps {
	candidate: Candidate | null;
	buckets: readonly BucketOption[];
	isSaving: boolean;
	isAccepting: boolean;
	onClose: () => void;
	onSave: (candidateId: string, bucket: string | null, text: string | null) => void;
	onClear: (candidateId: string) => void;
	onAccept: (candidate: Candidate) => void;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: conditional JSX rendering is idiomatic React
export function CandidateDetailSheet({
	candidate,
	buckets,
	isSaving,
	isAccepting,
	onClose,
	onSave,
	onClear,
	onAccept,
}: CandidateDetailSheetProps) {
	const [draftBucket, setDraftBucket] = useState<string | null>(null);
	const [draftText, setDraftText] = useState<string>('');

	// Reset draft when candidate changes
	useEffect(() => {
		if (candidate) {
			setDraftBucket(candidate.chosenBucket ?? candidate.suggestedBucket);
			setDraftText(candidate.chosenText ?? candidate.suggestedText ?? '');
		}
	}, [candidate]);

	if (!candidate) {
		return (
			<Sheet open={false}>
				<SheetContent />
			</Sheet>
		);
	}

	const status = getCandidateStatus(candidate);
	const effectiveBucket = getEffectiveBucket(candidate);
	const effectiveText = getEffectiveText(candidate);
	const canAccept = status === 'ready' && !isAccepting;
	const isAccepted = status === 'accepted';

	const hasChanges =
		draftBucket !== (candidate.chosenBucket ?? candidate.suggestedBucket) ||
		draftText !== (candidate.chosenText ?? candidate.suggestedText ?? '');

	const handleSave = () => {
		if (!hasChanges) return;
		onSave(candidate.id, draftBucket, draftText || null);
	};

	const handleClear = () => {
		onClear(candidate.id);
		setDraftBucket(candidate.suggestedBucket);
		setDraftText(candidate.suggestedText ?? '');
	};

	const handleAccept = () => {
		onAccept(candidate);
	};

	return (
		<Sheet open={!!candidate} onOpenChange={(open) => !open && onClose()}>
			<SheetContent side="right" className="sm:max-w-md overflow-y-auto px-0">
				<SheetHeader className="px-6">
					<div className="flex items-center justify-between">
						<SheetTitle className="text-lg font-semibold text-card-foreground">{candidate.term}</SheetTitle>
						{isAccepted && (
							<Badge variant="success">
								<Check className="h-3 w-3 mr-1" />
								Accepted
							</Badge>
						)}
					</div>
					<SheetDescription>Position {candidate.position + 1} in batch</SheetDescription>
				</SheetHeader>

				<div className="mt-6 space-y-6 px-6">
					{/* AI Suggestion section */}
					{(candidate.suggestedBucket || candidate.suggestedText) && (
						<div className="p-3 rounded-lg bg-card/50 border border-border">
							<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">AI Suggestion</h3>
							{candidate.suggestedBucket && (
								<div className="mb-2">
									<span className="text-muted-foreground text-sm">Bucket: </span>
									<Badge variant="outline" className="text-xs ml-1">
										{candidate.suggestedBucket}
									</Badge>
								</div>
							)}
							{candidate.suggestedText && <p className="text-muted-foreground text-sm">{candidate.suggestedText}</p>}
						</div>
					)}

					{/* Suggestion in progress */}
					{candidate.suggestionStatus === 'in_progress' && (
						<div className="p-3 rounded-lg">
							<Badge variant="warning" className="w-full justify-start gap-2">
								<Loader2 className="h-4 w-4 animate-spin" />
								<span className="text-sm">Generating suggestion...</span>
							</Badge>
						</div>
					)}

					{/* Suggestion error */}
					{candidate.suggestionStatus === 'error' && candidate.suggestionError && (
						<div className="p-3 rounded-lg">
							<h3 className="text-xs font-medium text-destructive uppercase tracking-wide mb-1">Suggestion Failed</h3>
							<p className="text-destructive text-sm">{candidate.suggestionError}</p>
						</div>
					)}

					{/* Edit form (only show if not accepted) */}
					{!isAccepted && (
						<div className="space-y-4">
							<h3 className="text-sm font-medium text-muted-foreground">Your Choice</h3>

							{/* Bucket select */}
							<div className="space-y-2">
								<Label htmlFor="bucket">Bucket</Label>
								<Select value={draftBucket ?? ''} onValueChange={(value) => setDraftBucket(value || null)} disabled={isSaving}>
									<SelectTrigger id="bucket">
										<SelectValue placeholder="Select a bucket" />
									</SelectTrigger>
									<SelectContent>
										{buckets.map((bucket) => (
											<SelectItem key={bucket.slug} value={bucket.slug}>
												{bucket.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{/* Definition textarea */}
							<div className="space-y-2">
								<Label htmlFor="definition">Definition</Label>
								<Textarea
									id="definition"
									value={draftText}
									onChange={(e) => setDraftText(e.target.value)}
									placeholder="Enter a definition..."
									className="min-h-[100px] resize-none"
									disabled={isSaving}
								/>
							</div>

							{/* Action buttons */}
							<div className="flex items-center justify-between pt-2">
								<div className="flex gap-2">
									<Button size="sm" onClick={handleSave} disabled={isSaving || !hasChanges}>
										{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
										Save
									</Button>
									<Button
										size="sm"
										variant="outline"
										onClick={handleClear}
										disabled={isSaving || (!candidate.chosenBucket && !candidate.chosenText)}
									>
										Clear overrides
									</Button>
								</div>

								{canAccept && (
									<Button size="sm" variant="outline" onClick={handleAccept} disabled={isAccepting}>
										{isAccepting ? (
											<>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												Accepting...
											</>
										) : (
											<>
												<Check className="mr-2 h-4 w-4" />
												Accept
											</>
										)}
									</Button>
								)}
							</div>
						</div>
					)}

					{/* Accepted state info */}
					{isAccepted && (
						<div className="p-3 rounded-lg">
							<Badge variant="success" className="mb-2">
								Accepted
							</Badge>
							{effectiveBucket && (
								<div className="mb-2">
									<span className="text-muted-foreground text-sm">Bucket: </span>
									<Badge variant="outline" className="text-xs ml-1">
										{effectiveBucket}
									</Badge>
								</div>
							)}
							{effectiveText && <p className="text-muted-foreground text-sm">{effectiveText}</p>}
						</div>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}

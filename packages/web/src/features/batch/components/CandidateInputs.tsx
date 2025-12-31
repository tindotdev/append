import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CandidateDraft } from '../types';

export interface BucketOption {
	slug: string;
	name: string;
}

export function CandidateInputs({
	draft,
	isSaving,
	buckets,
	onDraftChange,
}: {
	draft: CandidateDraft;
	isSaving: boolean;
	buckets: readonly BucketOption[];
	onDraftChange: (updates: Partial<CandidateDraft>) => void;
}) {
	return (
		<div className="flex flex-wrap gap-3">
			<Field>
				<FieldLabel htmlFor="candidate-bucket">Bucket</FieldLabel>
				<Select value={draft.bucket ?? ''} onValueChange={(value) => onDraftChange({ bucket: value || null })} disabled={isSaving}>
					<SelectTrigger id="candidate-bucket" size="sm" className="min-w-[140px]">
						<SelectValue placeholder="Select bucket..." />
					</SelectTrigger>
					<SelectContent>
						{buckets.map((bucket) => (
							<SelectItem key={bucket.slug} value={bucket.slug}>
								{bucket.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
			<Field className="flex-1 min-w-[200px]">
				<FieldLabel htmlFor="candidate-definition">Definition</FieldLabel>
				<Input
					id="candidate-definition"
					type="text"
					value={draft.text}
					onChange={(event) => onDraftChange({ text: event.target.value })}
					disabled={isSaving}
					maxLength={500}
					placeholder="Enter definition..."
				/>
			</Field>
		</div>
	);
}

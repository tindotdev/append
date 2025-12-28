import type { Bucket } from '@append/contracts/types';
import type { CandidateDraft } from '../types';

export function CandidateInputs({
	draft,
	isSaving,
	buckets,
	onDraftChange,
}: {
	draft: CandidateDraft;
	isSaving: boolean;
	buckets: readonly Bucket[];
	onDraftChange: (updates: Partial<CandidateDraft>) => void;
}) {
	return (
		<div className="flex flex-wrap gap-3">
			<div className="flex flex-col gap-1">
				<label className="text-xs text-zinc-500">Bucket</label>
				<select
					value={draft.bucket ?? ''}
					onChange={(event) => onDraftChange({ bucket: event.target.value ? (event.target.value as Bucket) : null })}
					disabled={isSaving}
					className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm disabled:opacity-50"
				>
					<option value="">Select bucket...</option>
					{buckets.map((bucket) => (
						<option key={bucket} value={bucket}>
							{bucket}
						</option>
					))}
				</select>
			</div>
			<div className="flex flex-col gap-1 flex-1 min-w-[200px]">
				<label className="text-xs text-zinc-500">Definition</label>
				<input
					type="text"
					value={draft.text}
					onChange={(event) => onDraftChange({ text: event.target.value })}
					disabled={isSaving}
					maxLength={500}
					placeholder="Enter definition..."
					className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm disabled:opacity-50 w-full"
				/>
			</div>
		</div>
	);
}

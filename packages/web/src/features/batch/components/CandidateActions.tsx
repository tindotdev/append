export function CandidateActions({
	isSaving,
	isSaveDisabled,
	onSave,
	onClear,
}: {
	isSaving: boolean;
	isSaveDisabled: boolean;
	onSave: () => void;
	onClear: () => void;
}) {
	return (
		<div className="flex gap-2">
			<button
				type="button"
				onClick={onSave}
				disabled={isSaveDisabled}
				className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
			>
				{isSaving && <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />}
				Save
			</button>
			<button
				type="button"
				onClick={onClear}
				disabled={isSaving}
				className="px-3 py-1.5 bg-zinc-700 text-zinc-200 text-sm rounded hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
			>
				Clear overrides
			</button>
		</div>
	);
}

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
			<Button type="button" size="sm" onClick={onSave} disabled={isSaveDisabled}>
				{isSaving && <Loader2 className="size-3 animate-spin" />}
				Save
			</Button>
			<Button type="button" size="sm" variant="outline" onClick={onClear} disabled={isSaving}>
				Clear overrides
			</Button>
		</div>
	);
}

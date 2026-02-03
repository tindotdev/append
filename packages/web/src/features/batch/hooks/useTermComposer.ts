import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useOutboxSafe } from '@/features/outbox';
import { UNDO_GRACE_MS } from '@/lib/outbox-adapter';

const TERM_MIN = 1;
const TERM_MAX = 200;
const TERM_CHAR_MAX = 200;
const FORBIDDEN_DELIMITER = ': ';
const STORAGE_KEY = 'append.captureDraft.v1';

export interface TermRow {
	id: string;
	value: string;
}

export type ValidationStatus = 'valid' | 'empty' | 'too-long' | 'forbidden-delimiter' | 'duplicate';

export interface TermValidation {
	status: ValidationStatus;
	message?: string;
}

export function validateTerm(value: string, existingTerms: string[], currentIndex: number): TermValidation {
	const trimmed = value.trim();

	if (!trimmed) {
		return { status: 'empty' };
	}

	if (trimmed.length > TERM_CHAR_MAX) {
		return { status: 'too-long', message: `Max ${TERM_CHAR_MAX} characters` };
	}

	if (trimmed.includes(FORBIDDEN_DELIMITER)) {
		return { status: 'forbidden-delimiter', message: 'Cannot contain ": "' };
	}

	const normalized = trimmed.toLowerCase();
	const isDuplicate = existingTerms.some((t, i) => i < currentIndex && t.trim().toLowerCase() === normalized);
	if (isDuplicate) {
		return { status: 'duplicate', message: 'Duplicate (allowed)' };
	}

	return { status: 'valid' };
}

export const validationDotClass: Record<ValidationStatus, string> = {
	valid: 'bg-success',
	duplicate: 'bg-warning',
	'too-long': 'bg-destructive',
	'forbidden-delimiter': 'bg-destructive',
	empty: 'bg-border',
};

export const validationMessageClass: Partial<Record<ValidationStatus, string>> = {
	duplicate: 'text-warning-foreground',
	'too-long': 'text-destructive',
	'forbidden-delimiter': 'text-destructive',
};

export function getInputClassName(hasError: boolean): string {
	if (!hasError) return 'pr-20';
	return 'pr-20 border-destructive focus-visible:ring-destructive';
}

function loadDraft(): TermRow[] {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			if (Array.isArray(parsed) && parsed.every((r) => r.id && typeof r.value === 'string')) {
				return parsed;
			}
		}
	} catch {
		// Ignore parse errors
	}
	return [{ id: crypto.randomUUID(), value: '' }];
}

function saveDraft(rows: TermRow[]): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
	} catch (err) {
		console.warn('Failed to save draft to localStorage:', err);
		toast.warning('Unable to save draft. Your changes may be lost on page refresh.');
	}
}

function clearDraft(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Ignore storage errors
	}
}

export const TERM_COMPOSER_MAX = TERM_MAX;

export function useTermComposer() {
	const outbox = useOutboxSafe();
	const [rows, setRows] = useState<TermRow[]>(() => loadDraft());
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [justSubmitted, setJustSubmitted] = useState(false);

	const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
	const focusRowId = useRef<string | null>(null);

	// Save draft on changes
	useEffect(() => {
		saveDraft(rows);
	}, [rows]);

	// Focus management after state updates
	useEffect(() => {
		if (focusRowId.current) {
			const input = inputRefs.current.get(focusRowId.current);
			if (input) {
				input.focus();
				input.setSelectionRange(input.value.length, input.value.length);
			}
			focusRowId.current = null;
		}
	});

	const termValues = rows.map((r) => r.value);
	const validTermCount = rows.filter((r) => r.value.trim()).length;

	const hasValidationErrors = rows.some((r, i) => {
		const validation = validateTerm(r.value, termValues, i);
		return validation.status === 'too-long' || validation.status === 'forbidden-delimiter';
	});

	const canSubmit = Boolean(outbox && validTermCount >= TERM_MIN && validTermCount <= TERM_MAX && !hasValidationErrors && !isSubmitting);

	const handleRowChange = useCallback((id: string, value: string) => {
		setRows((prev) => prev.map((r) => (r.id === id ? { ...r, value } : r)));
	}, []);

	const handleRowPaste = useCallback((id: string, e: React.ClipboardEvent<HTMLInputElement>) => {
		const pastedText = e.clipboardData.getData('text');
		const lines = pastedText.split(/\r?\n/).filter((line) => line.trim());

		if (lines.length > 1) {
			e.preventDefault();

			setRows((prev) => {
				const index = prev.findIndex((r) => r.id === id);
				if (index === -1) return prev;

				const newRows = lines.map((line) => ({
					id: crypto.randomUUID(),
					value: line.trim(),
				}));

				const result = [...prev.slice(0, index), ...newRows, ...prev.slice(index + 1)];
				focusRowId.current = newRows[newRows.length - 1].id;
				return result;
			});
		}
	}, []);

	const handleRemoveRow = useCallback((id: string) => {
		setRows((prev) => {
			if (prev.length <= 1) {
				return [{ id: prev[0].id, value: '' }];
			}
			return prev.filter((r) => r.id !== id);
		});
	}, []);

	const handleClearDraft = useCallback(() => {
		clearDraft();
		setRows([{ id: crypto.randomUUID(), value: '' }]);
	}, []);

	const restoreDraft = useCallback((termsString: string) => {
		const lines = termsString.split('\n').filter(Boolean);
		const newRows =
			lines.length > 0 ? lines.map((line) => ({ id: crypto.randomUUID(), value: line })) : [{ id: crypto.randomUUID(), value: '' }];
		setRows(newRows);
		saveDraft(newRows);
	}, []);

	const handleSubmit = useCallback(async () => {
		if (!canSubmit || !outbox) return;

		setIsSubmitting(true);

		try {
			const terms = rows.map((r) => r.value.trim()).filter(Boolean);
			const termsInput = terms.join('\n');

			const { item } = await outbox.enqueue({ terms: termsInput });

			clearDraft();
			setRows([{ id: crypto.randomUUID(), value: '' }]);
			setJustSubmitted(true);

			toast.info('Queued for sync', {
				duration: UNDO_GRACE_MS,
				action: {
					label: 'Undo',
					onClick: async () => {
						const result = await outbox.undo(item.id);
						if (result.success && result.command?.type === 'capture_terms') {
							restoreDraft(result.command.request.terms);
							setJustSubmitted(false);
							toast.success('Restored to composer');
						} else {
							toast.error('Cannot undo — already sent');
						}
					},
				},
			});
		} catch {
			toast.error('Failed to queue. Please try again.');
			setJustSubmitted(false);
		} finally {
			setIsSubmitting(false);
		}
	}, [canSubmit, outbox, rows, restoreDraft]);

	const handleRowKeyDown = useCallback(
		(id: string, e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
				e.preventDefault();
				const newRow: TermRow = { id: crypto.randomUUID(), value: '' };
				setRows((prev) => {
					const index = prev.findIndex((r) => r.id === id);
					if (index === -1) return prev;
					return [...prev.slice(0, index + 1), newRow, ...prev.slice(index + 1)];
				});
				focusRowId.current = newRow.id;
			} else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
				e.preventDefault();
				if (canSubmit) {
					handleSubmit();
				}
			} else if (e.key === 'Backspace' && (e.target as HTMLInputElement).value === '') {
				e.preventDefault();
				setRows((prev) => {
					if (prev.length <= 1) return prev;
					const index = prev.findIndex((r) => r.id === id);
					if (index === -1) return prev;
					const focusIndex = index > 0 ? index - 1 : 1;
					focusRowId.current = prev[focusIndex]?.id ?? null;
					return prev.filter((r) => r.id !== id);
				});
			}
		},
		[canSubmit, handleSubmit]
	);

	return {
		rows,
		isSubmitting,
		canSubmit,
		validTermCount,
		justSubmitted,
		setJustSubmitted,
		inputRefs,
		handleRowChange,
		handleRowPaste,
		handleRemoveRow,
		handleClearDraft,
		handleSubmit,
		handleRowKeyDown,
		restoreDraft,
	};
}

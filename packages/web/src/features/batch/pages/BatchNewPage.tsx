import { useNavigate } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ApiRequestError } from '@/lib/api-rpc';
import { createBatch } from '../api/create-batch';

// --- Constants ---
const TERM_MIN = 1;
const TERM_MAX = 200;
const TERM_CHAR_MAX = 200;
const FORBIDDEN_DELIMITER = ': ';
const STORAGE_KEY = 'append.captureDraft.v1';

// --- Types ---
interface TermRow {
	id: string;
	value: string;
}

type ValidationStatus = 'valid' | 'empty' | 'too-long' | 'forbidden-delimiter' | 'duplicate';

interface TermValidation {
	status: ValidationStatus;
	message?: string;
}

// --- Validation ---
function validateTerm(value: string, existingTerms: string[], currentIndex: number): TermValidation {
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

	// Check for duplicates (case-insensitive)
	const normalized = trimmed.toLowerCase();
	const isDuplicate = existingTerms.some((t, i) => i < currentIndex && t.trim().toLowerCase() === normalized);
	if (isDuplicate) {
		return { status: 'duplicate', message: 'Duplicate (allowed)' };
	}

	return { status: 'valid' };
}

const validationDotClass: Record<ValidationStatus, string> = {
	valid: 'bg-green-500',
	duplicate: 'bg-amber-500',
	'too-long': 'bg-red-500',
	'forbidden-delimiter': 'bg-red-500',
	empty: 'bg-zinc-600',
};

const validationMessageClass: Partial<Record<ValidationStatus, string>> = {
	duplicate: 'text-amber-400',
	'too-long': 'text-red-400',
	'forbidden-delimiter': 'text-red-400',
};

function getInputClassName(hasError: boolean): string {
	if (!hasError) {
		return 'pr-20';
	}

	return 'pr-20 border-red-500 focus-visible:ring-red-500';
}

// --- Local Storage ---
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
	} catch {
		// Ignore storage errors
	}
}

function clearDraft(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Ignore storage errors
	}
}

// --- Error handling ---
function getBatchErrorMessage(err: unknown): string {
	if (err instanceof ApiRequestError) {
		if (err.code === 'IDEMPOTENCY_CONFLICT') {
			return 'Request conflict. Please modify your input and try again.';
		}
		if (err.code === 'UNAUTHORIZED') {
			return 'Your session has expired. Please sign in again.';
		}
		return err.message;
	}
	return 'An unexpected error occurred. Please try again.';
}

// --- Component ---
export function BatchNewPage() {
	const navigate = useNavigate();

	const [rows, setRows] = useState<TermRow[]>(() => loadDraft());
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	// Track clientRequestId: generate once per submit attempt, regenerate on edit after failure
	const clientRequestIdRef = useRef<string | null>(null);
	const hasFailedRef = useRef(false);

	// Refs for focus management
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
				// Move cursor to end
				input.setSelectionRange(input.value.length, input.value.length);
			}
			focusRowId.current = null;
		}
	});

	// Get all term values for duplicate checking
	const termValues = rows.map((r) => r.value);

	// Count valid (non-empty) terms
	const validTermCount = rows.filter((r) => r.value.trim()).length;

	// Check if form is submittable
	const hasValidationErrors = rows.some((r, i) => {
		const validation = validateTerm(r.value, termValues, i);
		return validation.status === 'too-long' || validation.status === 'forbidden-delimiter';
	});
	const canSubmit = validTermCount >= TERM_MIN && validTermCount <= TERM_MAX && !hasValidationErrors && !isSubmitting;

	const handleRowChange = useCallback((id: string, value: string) => {
		// If user edits after a failure, clear the clientRequestId
		if (hasFailedRef.current) {
			clientRequestIdRef.current = null;
			hasFailedRef.current = false;
		}
		setSubmitError(null);
		setRows((prev) => prev.map((r) => (r.id === id ? { ...r, value } : r)));
	}, []);

	const handleRowPaste = useCallback((id: string, e: React.ClipboardEvent<HTMLInputElement>) => {
		const pastedText = e.clipboardData.getData('text');
		const lines = pastedText.split(/\r?\n/).filter((line) => line.trim());

		// If pasting multiple lines, split into rows
		if (lines.length > 1) {
			e.preventDefault();

			setRows((prev) => {
				const index = prev.findIndex((r) => r.id === id);
				if (index === -1) return prev;

				const newRows = lines.map((line) => ({
					id: crypto.randomUUID(),
					value: line.trim(),
				}));

				// Replace current row with first line, insert rest after
				const result = [...prev.slice(0, index), ...newRows, ...prev.slice(index + 1)];

				// Focus the last pasted row
				focusRowId.current = newRows[newRows.length - 1].id;

				return result;
			});
		}
	}, []);

	const handleRemoveRow = useCallback((id: string) => {
		setRows((prev) => {
			if (prev.length <= 1) {
				// If last row, just clear it
				return [{ id: prev[0].id, value: '' }];
			}
			return prev.filter((r) => r.id !== id);
		});
	}, []);

	const handleAddRow = useCallback(() => {
		const newRow: TermRow = { id: crypto.randomUUID(), value: '' };
		setRows((prev) => [...prev, newRow]);
		focusRowId.current = newRow.id;
	}, []);

	const handleClearDraft = useCallback(() => {
		clearDraft();
		setRows([{ id: crypto.randomUUID(), value: '' }]);
		setSubmitError(null);
		clientRequestIdRef.current = null;
		hasFailedRef.current = false;
	}, []);

	const handleSubmit = useCallback(async () => {
		if (!canSubmit) return;

		// Generate clientRequestId if we don't have one
		if (!clientRequestIdRef.current) {
			clientRequestIdRef.current = crypto.randomUUID();
		}

		setIsSubmitting(true);
		setSubmitError(null);

		try {
			// Collect non-empty terms
			const terms = rows.map((r) => r.value.trim()).filter(Boolean);
			const termsInput = terms.join('\n');

			const response = await createBatch({
				terms: termsInput,
				clientRequestId: clientRequestIdRef.current,
			});

			// Success - clear draft and navigate
			clearDraft();
			navigate({ to: '/batch/$batchId', params: { batchId: response.id } });
		} catch (err: unknown) {
			hasFailedRef.current = true;
			setSubmitError(getBatchErrorMessage(err));
		} finally {
			setIsSubmitting(false);
		}
	}, [canSubmit, rows, navigate]);

	const handleRowKeyDown = useCallback(
		(id: string, e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
				e.preventDefault();
				// Add new row below and focus it
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
				// Remove empty row on backspace and focus previous
				e.preventDefault();
				setRows((prev) => {
					if (prev.length <= 1) return prev;
					const index = prev.findIndex((r) => r.id === id);
					if (index === -1) return prev;
					// Focus previous row (or next if first)
					const focusIndex = index > 0 ? index - 1 : 1;
					focusRowId.current = prev[focusIndex]?.id ?? null;
					return prev.filter((r) => r.id !== id);
				});
			}
		},
		[canSubmit, handleSubmit]
	);

	return (
		<div className="max-w-2xl">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-xl font-semibold">Capture</h2>
					<p className="mt-1 text-sm text-zinc-400">Enter terms, one per row. Brain dump welcome.</p>
				</div>
				{rows.some((r) => r.value.trim()) && (
					<Button variant="ghost" size="sm" onClick={handleClearDraft} className="text-zinc-500 hover:text-zinc-300">
						Clear draft
					</Button>
				)}
			</div>

			<div className="mt-6 space-y-2">
				{rows.map((row, index) => {
					const validation = validateTerm(row.value, termValues, index);
					const hasError = validation.status === 'too-long' || validation.status === 'forbidden-delimiter';
					const messageClass = validationMessageClass[validation.status];
					const showMessage = Boolean(messageClass && validation.message);
					const dotClass = validationDotClass[validation.status] ?? 'bg-zinc-600';

					return (
						<div key={row.id} className="group flex items-center gap-2">
							<div className="flex h-8 w-8 shrink-0 items-center justify-center">
								<span className={`h-2 w-2 rounded-full ${dotClass}`} />
							</div>
							<div className="relative flex-1">
								<Input
									ref={(el) => {
										if (el) {
											inputRefs.current.set(row.id, el);
										} else {
											inputRefs.current.delete(row.id);
										}
									}}
									value={row.value}
									onChange={(e) => handleRowChange(row.id, e.target.value)}
									onPaste={(e) => handleRowPaste(row.id, e)}
									onKeyDown={(e) => handleRowKeyDown(row.id, e)}
									placeholder={index === 0 ? 'Type a term or paste many...' : ''}
									disabled={isSubmitting}
									className={getInputClassName(hasError)}
									aria-invalid={hasError}
								/>
								{showMessage && <span className={`absolute right-10 top-1/2 -translate-y-1/2 text-xs ${messageClass}`}>{validation.message}</span>}
							</div>
							<TooltipProvider delayDuration={300}>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											className="h-8 w-8 shrink-0 text-zinc-500 opacity-0 transition-opacity hover:text-zinc-300 group-hover:opacity-100 focus:opacity-100"
											onClick={() => handleRemoveRow(row.id)}
											disabled={isSubmitting}
											aria-label="Remove row"
										>
											<X className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="right">Remove</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					);
				})}
			</div>

			<div className="mt-4">
				<Button variant="ghost" size="sm" onClick={handleAddRow} disabled={isSubmitting} className="text-zinc-400 hover:text-zinc-200">
					+ Add term
				</Button>
			</div>

			{submitError && <p className="mt-4 text-sm text-red-400">{submitError}</p>}

			<div className="mt-6 flex items-center justify-between">
				<div className="text-sm text-zinc-500">
					<span className={validTermCount < TERM_MIN || validTermCount > TERM_MAX ? 'text-amber-400' : ''}>
						{validTermCount} term{validTermCount !== 1 ? 's' : ''}
					</span>
					<span className="mx-2">·</span>
					<span>
						{TERM_MIN}–{TERM_MAX} allowed
					</span>
				</div>
				<div className="flex items-center gap-3">
					<span className="hidden text-xs text-zinc-500 sm:inline-flex sm:items-center sm:gap-1">
						<Kbd>⌘</Kbd>
						<Kbd>↵</Kbd>
						<span className="ml-1">to submit</span>
					</span>
					<Button onClick={handleSubmit} disabled={!canSubmit}>
						{isSubmitting ? 'Submitting...' : 'Submit Batch'}
					</Button>
				</div>
			</div>
		</div>
	);
}

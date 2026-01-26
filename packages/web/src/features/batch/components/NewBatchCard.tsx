import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const STORAGE_KEY_EXPANDED = 'append.captureCard.expanded.v1';

interface TermRow {
	id: string;
	value: string;
}

type ValidationStatus = 'valid' | 'empty' | 'too-long' | 'forbidden-delimiter' | 'duplicate';

interface TermValidation {
	status: ValidationStatus;
	message?: string;
}

interface NewBatchCardProps {
	rows: TermRow[];
	isSubmitting: boolean;
	canSubmit: boolean;
	validTermCount: number;
	termMin: number;
	termMax: number;
	onRowChange: (id: string, value: string) => void;
	onRowPaste: (id: string, e: React.ClipboardEvent<HTMLInputElement>) => void;
	onRowKeyDown: (id: string, e: React.KeyboardEvent<HTMLInputElement>) => void;
	onRemoveRow: (id: string) => void;
	onAddRow: () => void;
	onClearDraft: () => void;
	onSubmit: () => void;
	inputRefs: React.MutableRefObject<Map<string, HTMLInputElement>>;
	validateTerm: (value: string, existingTerms: string[], currentIndex: number) => TermValidation;
	validationDotClass: Record<ValidationStatus, string>;
	validationMessageClass: Partial<Record<ValidationStatus, string>>;
	getInputClassName: (hasError: boolean) => string;
}

export function NewBatchCard({
	rows,
	isSubmitting,
	canSubmit,
	validTermCount,
	termMin,
	termMax,
	onRowChange,
	onRowPaste,
	onRowKeyDown,
	onRemoveRow,
	onAddRow,
	onClearDraft,
	onSubmit,
	inputRefs,
	validateTerm,
	validationDotClass,
	validationMessageClass,
	getInputClassName,
}: NewBatchCardProps) {
	// Load expanded state from localStorage
	const [isOpen, setIsOpen] = useState(() => {
		try {
			const stored = localStorage.getItem(STORAGE_KEY_EXPANDED);
			return stored === null ? true : stored === 'true';
		} catch {
			return true;
		}
	});

	// Save expanded state to localStorage
	useEffect(() => {
		try {
			localStorage.setItem(STORAGE_KEY_EXPANDED, String(isOpen));
		} catch {
			// Ignore storage errors
		}
	}, [isOpen]);

	// Get all term values for duplicate checking
	const termValues = rows.map((r) => r.value);

	// Check if any rows have content
	const hasContent = rows.some((r) => r.value.trim());

	return (
		<Card>
			<Collapsible open={isOpen} onOpenChange={setIsOpen}>
				<CardHeader>
					<div className="flex items-start justify-between gap-4">
						<div className="flex-1 space-y-1">
							<CardTitle>Capture</CardTitle>
							<CardDescription>Enter terms, one per row. Brain dump welcome.</CardDescription>
						</div>
						<div className="flex items-center gap-2">
							{hasContent && (
								<Button variant="ghost" size="sm" onClick={onClearDraft} className="text-zinc-500 hover:text-zinc-300 shrink-0">
									Clear draft
								</Button>
							)}
							<CollapsibleTrigger asChild>
								<Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
									{isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
								</Button>
							</CollapsibleTrigger>
						</div>
					</div>
				</CardHeader>

				<CollapsibleContent>
					<CardContent>
						{/* Term Input Rows */}
						<div className="space-y-2">
							{rows.map((row, index) => {
								const validation = validateTerm(row.value, termValues, index);
								const hasError = validation.status === 'too-long' || validation.status === 'forbidden-delimiter';
								const messageClass = validationMessageClass[validation.status];
								const showMessage = Boolean(messageClass && validation.message);
								const dotClass = validationDotClass[validation.status] ?? 'bg-zinc-600';

								return (
									<div key={row.id} className="group flex items-center gap-2.5">
										<div className="flex h-9 w-8 shrink-0 items-center justify-center">
											<span className={`h-2 w-2 rounded-full transition-colors ${dotClass}`} />
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
												onChange={(e) => onRowChange(row.id, e.target.value)}
												onPaste={(e) => onRowPaste(row.id, e)}
												onKeyDown={(e) => onRowKeyDown(row.id, e)}
												placeholder={index === 0 ? 'Type a term or paste many...' : ''}
												disabled={isSubmitting}
												className={getInputClassName(hasError)}
												aria-invalid={hasError}
											/>
											{showMessage && (
												<span className={`absolute right-10 top-1/2 -translate-y-1/2 text-xs ${messageClass}`}>{validation.message}</span>
											)}
										</div>
										<TooltipProvider delayDuration={300}>
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														className="h-9 w-9 shrink-0 text-zinc-500 opacity-0 transition-all hover:text-zinc-300 group-hover:opacity-100 focus:opacity-100"
														onClick={() => onRemoveRow(row.id)}
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
					</CardContent>

					<CardFooter>
						{/* Bottom Actions Bar */}
						<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full border-t border-zinc-800/50 pt-6">
							<div className="flex items-center gap-4">
								<div className="text-sm text-zinc-500">
									<span className={validTermCount < termMin || validTermCount > termMax ? 'text-amber-400 font-medium' : 'font-medium'}>
										{validTermCount} term{validTermCount !== 1 ? 's' : ''}
									</span>
									<span className="mx-2 text-zinc-700">·</span>
									<span className="text-zinc-600">
										{termMin}–{termMax} allowed
									</span>
								</div>
								<Button variant="ghost" size="sm" onClick={onAddRow} disabled={isSubmitting} className="text-zinc-400 hover:text-zinc-200 -ml-1">
									+ Add term
								</Button>
							</div>
							<div className="flex items-center gap-3">
								<span className="hidden text-xs text-zinc-500 sm:inline-flex sm:items-center sm:gap-1.5">
									<Kbd>⌘</Kbd>
									<Kbd>↵</Kbd>
									<span className="ml-1">to submit</span>
								</span>
								<Button onClick={onSubmit} disabled={!canSubmit} size="default" className="shrink-0">
									{isSubmitting ? 'Submitting...' : 'Submit Batch'}
								</Button>
							</div>
						</div>
					</CardFooter>
				</CollapsibleContent>
			</Collapsible>
		</Card>
	);
}

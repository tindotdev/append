import { Pencil, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { ApiRequestError } from '@/lib/api-rpc';
import { useArchiveTerm, useRestoreTerm } from '../api/archive-term';
import { useArchiveTermSense, useRestoreTermSense } from '../api/archive-term-sense';
import { useTermDetail } from '../api/get-term';
import { useUpdateTerm } from '../api/update-term';
import { useUpdateTermSense } from '../api/update-term-sense';

interface TermDetailSheetProps {
	termId: string | null;
	onClose: () => void;
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
}

interface UpdateWithUndoOptions {
	update: () => Promise<unknown>;
	undo: () => Promise<unknown>;
	onSaved: () => void;
	onSuccess?: () => void;
	successMessage: string;
	conflictMessage: string;
	failureMessage: string;
	undoFailureMessage: string;
}

async function runUpdateWithUndo(options: UpdateWithUndoOptions): Promise<void> {
	try {
		await options.update();
		options.onSuccess?.();
		options.onSaved();

		toast.success(options.successMessage, {
			action: {
				label: 'Undo',
				onClick: async () => {
					try {
						await options.undo();
						options.onSaved();
						toast.success('Undone');
					} catch {
						toast.error(options.undoFailureMessage);
					}
				},
			},
		});
	} catch (error) {
		if (error instanceof ApiRequestError && error.status === 409) {
			toast.error(options.conflictMessage);
			options.onSaved();
		} else {
			toast.error(options.failureMessage);
		}
	}
}

interface EditableSenseProps {
	sense: {
		id: string;
		bucket: string;
		text: string;
		source: string;
		version: number;
		createdAt: number;
		isPrimary: boolean;
	};
	canDelete: boolean;
	onSaved: () => void;
	onDeleted: () => void;
}

function EditableSense({ sense, canDelete, onSaved, onDeleted }: EditableSenseProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [editedText, setEditedText] = useState(sense.text);
	const updateSense = useUpdateTermSense();
	const archiveSense = useArchiveTermSense();
	const restoreSense = useRestoreTermSense();

	const handleSave = async () => {
		if (editedText.trim() === sense.text) {
			setIsEditing(false);
			return;
		}

		const previousText = sense.text;

		await runUpdateWithUndo({
			update: () =>
				updateSense.mutateAsync({
					senseId: sense.id,
					request: {
						expectedVersion: sense.version,
						text: editedText.trim(),
					},
				}),
			undo: () =>
				updateSense.mutateAsync({
					senseId: sense.id,
					request: {
						expectedVersion: sense.version + 1,
						text: previousText,
					},
				}),
			onSaved,
			onSuccess: () => setIsEditing(false),
			successMessage: 'Definition updated',
			conflictMessage: 'Conflict: someone else modified this. Please refresh.',
			failureMessage: 'Save failed. Please try again.',
			undoFailureMessage: 'Undo failed',
		});
	};

	const handleDelete = async () => {
		try {
			const result = await archiveSense.mutateAsync({
				senseId: sense.id,
				expectedVersion: sense.version,
			});

			onDeleted();

			toast.success('Definition deleted', {
				action: {
					label: 'Undo',
					onClick: async () => {
						try {
							await restoreSense.mutateAsync({
								senseId: sense.id,
								expectedVersion: result.sense.version,
							});
							onSaved();
							toast.success('Restored');
						} catch {
							toast.error('Undo failed');
						}
					},
				},
			});
		} catch (error) {
			if (error instanceof ApiRequestError && error.status === 409) {
				toast.error('Conflict: Please refresh the page');
				onSaved();
			} else {
				toast.error('Delete failed');
			}
		}
	};

	const handleCancel = () => {
		setEditedText(sense.text);
		setIsEditing(false);
	};

	if (isEditing) {
		return (
			<div className="space-y-2">
				<Textarea value={editedText} onChange={(e) => setEditedText(e.target.value)} className="min-h-[80px] resize-none" autoFocus />
				<div className="flex gap-2">
					<Button size="sm" onClick={handleSave} disabled={updateSense.isPending}>
						{updateSense.isPending ? 'Saving...' : 'Save'}
					</Button>
					<Button size="sm" variant="ghost" onClick={handleCancel}>
						Cancel
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="group relative">
			<p className="text-zinc-300 pr-16">{sense.text}</p>
			<div className="absolute right-0 top-0 flex gap-1 opacity-0 group-hover:opacity-100">
				<Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setIsEditing(true)}>
					<Pencil className="h-3 w-3" />
				</Button>
				{canDelete && (
					<Button
						size="icon"
						variant="ghost"
						className="h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-500/10"
						onClick={handleDelete}
						disabled={archiveSense.isPending}
					>
						<Trash2 className="h-3 w-3" />
					</Button>
				)}
			</div>
		</div>
	);
}

interface EditableTermNameProps {
	termId: string;
	displayTerm: string;
	version: number;
	onSaved: () => void;
}

function EditableTermName({ termId, displayTerm, version, onSaved }: EditableTermNameProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [editedName, setEditedName] = useState(displayTerm);
	const updateTerm = useUpdateTerm();

	const handleSave = async () => {
		if (editedName.trim() === displayTerm) {
			setIsEditing(false);
			return;
		}

		const previousName = displayTerm;

		await runUpdateWithUndo({
			update: () =>
				updateTerm.mutateAsync({
					termId,
					request: {
						expectedVersion: version,
						displayTerm: editedName.trim(),
					},
				}),
			undo: () =>
				updateTerm.mutateAsync({
					termId,
					request: {
						expectedVersion: version + 1,
						displayTerm: previousName,
					},
				}),
			onSaved,
			onSuccess: () => setIsEditing(false),
			successMessage: 'Term updated',
			conflictMessage: 'Conflict: someone else modified this. Please refresh.',
			failureMessage: 'Save failed. Please try again.',
			undoFailureMessage: 'Undo failed',
		});
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			handleSave();
		} else if (e.key === 'Escape') {
			setEditedName(displayTerm);
			setIsEditing(false);
		}
	};

	if (isEditing) {
		return (
			<div className="flex items-center gap-2">
				<Input
					value={editedName}
					onChange={(e) => setEditedName(e.target.value)}
					onKeyDown={handleKeyDown}
					onBlur={handleSave}
					className="text-lg font-semibold h-8"
					autoFocus
				/>
			</div>
		);
	}

	return (
		<div className="group flex items-center gap-2">
			<span className="text-lg font-semibold text-zinc-100">{displayTerm}</span>
			<Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 h-6 w-6" onClick={() => setIsEditing(true)}>
				<Pencil className="h-3 w-3" />
			</Button>
		</div>
	);
}

export function TermDetailSheet({ termId, onClose }: TermDetailSheetProps) {
	const { data, isLoading, error, refetch } = useTermDetail(termId);
	const archiveTerm = useArchiveTerm();
	const restoreTerm = useRestoreTerm();

	const handleSaved = () => {
		refetch();
	};

	const handleDeleteTerm = async () => {
		if (!data) return;

		try {
			const result = await archiveTerm.mutateAsync({
				termId: data.term.id,
				expectedVersion: data.term.version,
			});

			onClose();

			toast.success('Term deleted', {
				action: {
					label: 'Undo',
					onClick: async () => {
						try {
							await restoreTerm.mutateAsync({
								termId: data.term.id,
								expectedVersion: result.term.version,
							});
							toast.success('Restored');
						} catch {
							toast.error('Undo failed');
						}
					},
				},
			});
		} catch (error) {
			if (error instanceof ApiRequestError && error.status === 409) {
				toast.error('Conflict: Please refresh the page');
				refetch();
			} else {
				toast.error('Delete failed');
			}
		}
	};

	return (
		<Sheet open={!!termId} onOpenChange={(open) => !open && onClose()}>
			<SheetContent side="right" className="sm:max-w-md overflow-y-auto">
				{isLoading && (
					<div className="flex items-center justify-center py-12">
						<span className="text-zinc-400">Loading...</span>
					</div>
				)}

				{error && (
					<div className="p-4">
						<Alert variant="destructive" className="mb-4">
							<XCircle className="size-4" />
							<AlertTitle>Error</AlertTitle>
							<AlertDescription>Failed to load term details.</AlertDescription>
						</Alert>
						<Button variant="secondary" onClick={() => refetch()} className="w-full">
							Retry
						</Button>
					</div>
				)}

				{data && (
					<>
						<SheetHeader>
							<div className="flex items-center justify-between">
								<SheetTitle asChild>
									<EditableTermName termId={data.term.id} displayTerm={data.term.displayTerm} version={data.term.version} onSaved={handleSaved} />
								</SheetTitle>
								<Button
									size="icon"
									variant="ghost"
									className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
									onClick={handleDeleteTerm}
									disabled={archiveTerm.isPending}
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
							<SheetDescription>Added {formatDate(data.term.createdAt)}</SheetDescription>
						</SheetHeader>

						<div className="mt-6 space-y-6">
							<div>
								<h3 className="text-sm font-medium text-zinc-400 mb-3">
									{data.senses.length === 1 ? 'Definition' : `Definitions (${data.senses.length})`}
								</h3>
								<div className="space-y-4">
									{data.senses.map((sense) => (
										<div key={sense.id} className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
											<div className="flex items-center gap-2 mb-2">
												<span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{sense.bucket}</span>
												{sense.isPrimary && <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">Primary</span>}
											</div>
											<EditableSense sense={sense} canDelete={data.senses.length > 1} onSaved={handleSaved} onDeleted={handleSaved} />
											<div className="mt-2 text-xs text-zinc-500">
												Source: {sense.source} &middot; {formatDate(sense.createdAt)}
											</div>
										</div>
									))}
								</div>
							</div>
						</div>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}

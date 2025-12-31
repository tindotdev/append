/**
 * Main bucket manager component with CRUD operations.
 */

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCreateBucket, useDeleteBucket, useReorderBuckets, useUpdateBucket, useUserBuckets, type UserBucket } from '../api/user-bucket';
import { BucketForm, type BucketFormData } from './BucketForm';
import { BucketList } from './BucketList';

type ViewState =
	| { mode: 'list' }
	| { mode: 'create' }
	| { mode: 'edit'; bucket: UserBucket }
	| { mode: 'confirm-delete'; bucket: UserBucket };

export function BucketManager() {
	const [viewState, setViewState] = useState<ViewState>({ mode: 'list' });
	const [error, setError] = useState<string | null>(null);

	const { data, isLoading, isError, refetch } = useUserBuckets();
	const createMutation = useCreateBucket();
	const updateMutation = useUpdateBucket();
	const deleteMutation = useDeleteBucket();
	const reorderMutation = useReorderBuckets();

	const buckets = data?.buckets ?? [];
	const MAX_BUCKETS = 20;
	const canCreate = buckets.length < MAX_BUCKETS;

	const handleCreate = async (formData: BucketFormData) => {
		try {
			setError(null);
			await createMutation.mutateAsync(formData);
			setViewState({ mode: 'list' });
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create bucket');
		}
	};

	const handleUpdate = async (formData: BucketFormData) => {
		if (viewState.mode !== 'edit') return;

		try {
			setError(null);
			await updateMutation.mutateAsync({
				id: viewState.bucket.id,
				input: {
					name: formData.name,
					description: formData.description,
					color: formData.color,
				},
			});
			setViewState({ mode: 'list' });
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to update bucket');
		}
	};

	const handleDelete = async () => {
		if (viewState.mode !== 'confirm-delete') return;

		try {
			setError(null);
			await deleteMutation.mutateAsync(viewState.bucket.id);
			setViewState({ mode: 'list' });
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to delete bucket');
		}
	};

	const handleReorder = (bucketIds: string[]) => {
		reorderMutation.mutate(bucketIds, {
			onError: (err) => {
				setError(err instanceof Error ? err.message : 'Failed to reorder buckets');
			},
		});
	};

	// Loading state
	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-12">
				<span className="text-zinc-400">Loading buckets...</span>
			</div>
		);
	}

	// Error state
	if (isError) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-center">
				<p className="text-zinc-400">Failed to load buckets.</p>
				<Button type="button" variant="ghost" onClick={() => refetch()} className="mt-4">
					Retry
				</Button>
			</div>
		);
	}

	// Confirm delete modal
	if (viewState.mode === 'confirm-delete') {
		return (
			<div className="space-y-6">
				<div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
					<h3 className="text-lg font-medium text-zinc-100">Delete Bucket</h3>
					<p className="text-zinc-400 mt-2">
						Are you sure you want to delete <strong className="text-zinc-200">{viewState.bucket.name}</strong>?
					</p>
					{viewState.bucket.senseCount > 0 && (
						<p className="text-amber-500 mt-2">
							This bucket contains {viewState.bucket.senseCount} item{viewState.bucket.senseCount !== 1 ? 's' : ''}. You must move or delete all
							items before deleting the bucket.
						</p>
					)}
					{error && <p className="text-red-400 mt-4">{error}</p>}
					<div className="flex items-center justify-end gap-3 mt-6">
						<Button
							type="button"
							variant="ghost"
							onClick={() => {
								setError(null);
								setViewState({ mode: 'list' });
							}}
							disabled={deleteMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={handleDelete}
							disabled={deleteMutation.isPending || viewState.bucket.senseCount > 0}
						>
							{deleteMutation.isPending ? 'Deleting...' : 'Delete Bucket'}
						</Button>
					</div>
				</div>
			</div>
		);
	}

	// Create/edit form
	if (viewState.mode === 'create' || viewState.mode === 'edit') {
		return (
			<div className="space-y-6">
				<div>
					<h3 className="text-lg font-medium text-zinc-100">{viewState.mode === 'create' ? 'Create Bucket' : 'Edit Bucket'}</h3>
					<p className="text-sm text-zinc-400 mt-1">
						{viewState.mode === 'create' ? 'Add a new bucket to organize your terms.' : 'Update bucket details.'}
					</p>
				</div>

				{error && (
					<div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3">
						<p className="text-sm text-red-400">{error}</p>
					</div>
				)}

				<div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
					<BucketForm
						bucket={viewState.mode === 'edit' ? viewState.bucket : undefined}
						onSubmit={viewState.mode === 'create' ? handleCreate : handleUpdate}
						onCancel={() => {
							setError(null);
							setViewState({ mode: 'list' });
						}}
						isPending={createMutation.isPending || updateMutation.isPending}
					/>
				</div>
			</div>
		);
	}

	// List view
	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-lg font-medium text-zinc-100">Buckets</h3>
					<p className="text-sm text-zinc-400 mt-1">
						{buckets.length} of {MAX_BUCKETS} buckets used. Drag to reorder.
					</p>
				</div>
				<Button type="button" onClick={() => setViewState({ mode: 'create' })} disabled={!canCreate}>
					<Plus className="size-4 mr-2" />
					New Bucket
				</Button>
			</div>

			{error && (
				<div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3">
					<p className="text-sm text-red-400">{error}</p>
				</div>
			)}

			<BucketList
				buckets={buckets}
				onReorder={handleReorder}
				onEdit={(bucket) => setViewState({ mode: 'edit', bucket })}
				onDelete={(bucket) => setViewState({ mode: 'confirm-delete', bucket })}
				isReordering={reorderMutation.isPending}
			/>
		</div>
	);
}

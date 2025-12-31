/**
 * Main bucket manager component with CRUD operations.
 */

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { type UserBucket, useCreateBucket, useDeleteBucket, useReorderBuckets, useUpdateBucket, useUserBuckets } from '../api/user-bucket';
import { BucketForm, type BucketFormData } from './BucketForm';
import { BucketList } from './BucketList';

type ViewState =
	| { mode: 'list' }
	| { mode: 'create' }
	| { mode: 'edit'; bucket: UserBucket }
	| { mode: 'confirm-delete'; bucket: UserBucket };

function BucketLoadingState() {
	return (
		<div className="flex items-center justify-center py-12">
			<span className="text-zinc-400">Loading buckets...</span>
		</div>
	);
}

function BucketErrorState({ onRetry }: { onRetry: () => void }) {
	return (
		<div className="flex flex-col items-center justify-center py-12 text-center">
			<p className="text-zinc-400">Failed to load buckets.</p>
			<Button type="button" variant="ghost" onClick={onRetry} className="mt-4">
				Retry
			</Button>
		</div>
	);
}

function BucketDeleteConfirmation({
	bucket,
	error,
	isPending,
	onConfirm,
	onCancel,
}: {
	bucket: UserBucket;
	error: string | null;
	isPending: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	return (
		<div className="space-y-6">
			<div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
				<h3 className="text-lg font-medium text-zinc-100">Delete Bucket</h3>
				<p className="text-zinc-400 mt-2">
					Are you sure you want to delete <strong className="text-zinc-200">{bucket.name}</strong>?
				</p>
				{bucket.senseCount > 0 && (
					<p className="text-amber-500 mt-2">
						This bucket contains {bucket.senseCount} item{bucket.senseCount !== 1 ? 's' : ''}. You must move or delete all items before deleting
						the bucket.
					</p>
				)}
				{error && <p className="text-red-400 mt-4">{error}</p>}
				<div className="flex items-center justify-end gap-3 mt-6">
					<Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
						Cancel
					</Button>
					<Button type="button" variant="destructive" onClick={onConfirm} disabled={isPending || bucket.senseCount > 0}>
						{isPending ? 'Deleting...' : 'Delete Bucket'}
					</Button>
				</div>
			</div>
		</div>
	);
}

function BucketFormView({
	mode,
	bucket,
	error,
	isPending,
	onSubmit,
	onCancel,
}: {
	mode: 'create' | 'edit';
	bucket?: UserBucket;
	error: string | null;
	isPending: boolean;
	onSubmit: (data: BucketFormData) => void;
	onCancel: () => void;
}) {
	return (
		<div className="space-y-6">
			<div>
				<h3 className="text-lg font-medium text-zinc-100">{mode === 'create' ? 'Create Bucket' : 'Edit Bucket'}</h3>
				<p className="text-sm text-zinc-400 mt-1">
					{mode === 'create' ? 'Add a new bucket to organize your terms.' : 'Update bucket details.'}
				</p>
			</div>

			{error && (
				<div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3">
					<p className="text-sm text-red-400">{error}</p>
				</div>
			)}

			<div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
				<BucketForm bucket={bucket} onSubmit={onSubmit} onCancel={onCancel} isPending={isPending} />
			</div>
		</div>
	);
}

function BucketListView({
	buckets,
	error,
	isReordering,
	onCreateClick,
	onReorder,
	onEdit,
	onDelete,
}: {
	buckets: UserBucket[];
	error: string | null;
	isReordering: boolean;
	onCreateClick: () => void;
	onReorder: (bucketIds: string[]) => void;
	onEdit: (bucket: UserBucket) => void;
	onDelete: (bucket: UserBucket) => void;
}) {
	const MAX_BUCKETS = 20;
	const canCreate = buckets.length < MAX_BUCKETS;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-lg font-medium text-zinc-100">Buckets</h3>
					<p className="text-sm text-zinc-400 mt-1">
						{buckets.length} of {MAX_BUCKETS} buckets used. Drag to reorder.
					</p>
				</div>
				<Button type="button" onClick={onCreateClick} disabled={!canCreate}>
					<Plus className="size-4 mr-2" />
					New Bucket
				</Button>
			</div>

			{error && (
				<div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3">
					<p className="text-sm text-red-400">{error}</p>
				</div>
			)}

			<BucketList buckets={buckets} onReorder={onReorder} onEdit={onEdit} onDelete={onDelete} isReordering={isReordering} />
		</div>
	);
}

export function BucketManager() {
	const [viewState, setViewState] = useState<ViewState>({ mode: 'list' });
	const [error, setError] = useState<string | null>(null);

	const { data, isLoading, isError, refetch } = useUserBuckets();
	const createMutation = useCreateBucket();
	const updateMutation = useUpdateBucket();
	const deleteMutation = useDeleteBucket();
	const reorderMutation = useReorderBuckets();

	const buckets = data?.buckets ?? [];

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

	if (isLoading) return <BucketLoadingState />;
	if (isError) return <BucketErrorState onRetry={refetch} />;

	if (viewState.mode === 'confirm-delete') {
		return (
			<BucketDeleteConfirmation
				bucket={viewState.bucket}
				error={error}
				isPending={deleteMutation.isPending}
				onConfirm={handleDelete}
				onCancel={() => {
					setError(null);
					setViewState({ mode: 'list' });
				}}
			/>
		);
	}

	if (viewState.mode === 'create' || viewState.mode === 'edit') {
		return (
			<BucketFormView
				mode={viewState.mode}
				bucket={viewState.mode === 'edit' ? viewState.bucket : undefined}
				error={error}
				isPending={createMutation.isPending || updateMutation.isPending}
				onSubmit={viewState.mode === 'create' ? handleCreate : handleUpdate}
				onCancel={() => {
					setError(null);
					setViewState({ mode: 'list' });
				}}
			/>
		);
	}

	return (
		<BucketListView
			buckets={buckets}
			error={error}
			isReordering={reorderMutation.isPending}
			onCreateClick={() => setViewState({ mode: 'create' })}
			onReorder={handleReorder}
			onEdit={(bucket) => setViewState({ mode: 'edit', bucket })}
			onDelete={(bucket) => setViewState({ mode: 'confirm-delete', bucket })}
		/>
	);
}

/**
 * Main bucket manager component with CRUD operations.
 */

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { type UserBucket, useCreateBucket, useDeleteBucket, useReorderBuckets, useUpdateBucket, useUserBuckets } from '../api/user-bucket';
import { BucketForm, type BucketFormData } from './BucketForm';
import { BucketList } from './BucketList';

type ViewState = { mode: 'list' } | { mode: 'create' } | { mode: 'edit'; bucket: UserBucket };

function BucketLoadingState() {
	return (
		<Card>
			<CardHeader>
				<CardDescription className="text-xs">Learning organization</CardDescription>
				<CardTitle className="text-base">Buckets</CardTitle>
				<CardDescription>Create, organize, and manage your learning buckets</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center justify-between">
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-10 w-28" />
				</div>
				<div className="space-y-2">
					{[1, 2, 3].map((i) => (
						<Skeleton key={i} className="h-16 w-full" />
					))}
				</div>
			</CardContent>
		</Card>
	);
}

function BucketErrorState({ onRetry }: { onRetry: () => void }) {
	return (
		<Card>
			<CardHeader>
				<CardDescription className="text-xs">Learning organization</CardDescription>
				<CardTitle className="text-base">Buckets</CardTitle>
				<CardDescription>Create, organize, and manage your learning buckets</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex flex-col items-center justify-center py-12 text-center">
					<p className="text-muted-foreground">Failed to load buckets.</p>
					<Button type="button" variant="ghost" onClick={onRetry} className="mt-4">
						Retry
					</Button>
				</div>
			</CardContent>
		</Card>
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
	onSubmit: (data: BucketFormData) => Promise<void>;
	onCancel: () => void;
}) {
	return (
		<Card>
			<CardHeader>
				<CardDescription className="text-xs">Learning organization</CardDescription>
				<CardTitle className="text-base">{mode === 'create' ? 'Create Bucket' : 'Edit Bucket'}</CardTitle>
				<CardDescription>{mode === 'create' ? 'Add a new bucket to organize your terms.' : 'Update bucket details.'}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<div className="rounded-lg border border-border bg-card/50 p-6">
					<BucketForm bucket={bucket} onSubmit={onSubmit} onCancel={onCancel} isPending={isPending} />
				</div>
			</CardContent>
		</Card>
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
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div className="space-y-1.5">
						<CardDescription className="text-xs">Learning organization</CardDescription>
						<CardTitle className="text-base">Buckets</CardTitle>
						<CardDescription>
							{buckets.length} of {MAX_BUCKETS} buckets used. Drag to reorder.
						</CardDescription>
					</div>
					<Button type="button" onClick={onCreateClick} disabled={!canCreate}>
						<Plus className="size-4 mr-2" />
						New Bucket
					</Button>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<BucketList buckets={buckets} onReorder={onReorder} onEdit={onEdit} onDelete={onDelete} isReordering={isReordering} />
			</CardContent>
		</Card>
	);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: CRUD orchestrator with create/update/delete flows
export function BucketManager() {
	const [viewState, setViewState] = useState<ViewState>({ mode: 'list' });
	const [error, setError] = useState<string | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<UserBucket | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);

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
				},
			});
			setViewState({ mode: 'list' });
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to update bucket');
		}
	};

	const handleDelete = async () => {
		if (!deleteTarget) return;

		try {
			setDeleteError(null);
			await deleteMutation.mutateAsync(deleteTarget.id);
			setDeleteTarget(null);
		} catch (err) {
			setDeleteError(err instanceof Error ? err.message : 'Failed to delete bucket');
		}
	};

	const handleReorder = (bucketIds: string[]) => {
		reorderMutation.mutate(bucketIds, {
			onError: (err) => {
				setError(err instanceof Error ? err.message : 'Failed to reorder buckets');
			},
		});
	};

	const closeDeleteDialog = () => {
		setDeleteTarget(null);
		setDeleteError(null);
	};

	if (isLoading) return <BucketLoadingState />;
	if (isError) return <BucketErrorState onRetry={refetch} />;

	return (
		<>
			{viewState.mode === 'create' || viewState.mode === 'edit' ? (
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
			) : (
				<BucketListView
					buckets={buckets}
					error={error}
					isReordering={reorderMutation.isPending}
					onCreateClick={() => setViewState({ mode: 'create' })}
					onReorder={handleReorder}
					onEdit={(bucket) => setViewState({ mode: 'edit', bucket })}
					onDelete={(bucket) => setDeleteTarget(bucket)}
				/>
			)}

			{/* Delete confirmation dialog */}
			<Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && closeDeleteDialog()}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete Bucket</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete <strong className="text-foreground">{deleteTarget?.name}</strong>?
						</DialogDescription>
					</DialogHeader>

					{deleteTarget && deleteTarget.senseCount > 0 && (
						<Alert className="bg-yellow-900/20 border-yellow-800">
							<AlertDescription className="text-yellow-300">
								This bucket contains {deleteTarget.senseCount} item{deleteTarget.senseCount !== 1 ? 's' : ''}. You must move or delete all items
								before deleting the bucket.
							</AlertDescription>
						</Alert>
					)}

					{deleteError && (
						<Alert variant="destructive">
							<AlertDescription>{deleteError}</AlertDescription>
						</Alert>
					)}

					<DialogFooter>
						<DialogClose asChild>
							<Button variant="ghost" disabled={deleteMutation.isPending}>
								Cancel
							</Button>
						</DialogClose>
						<Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending || (deleteTarget?.senseCount ?? 0) > 0}>
							{deleteMutation.isPending ? 'Deleting...' : 'Delete Bucket'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

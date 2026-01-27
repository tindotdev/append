import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import type { RowSelectionState } from '@tanstack/react-table';
import { Loader2, Search } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api-rpc';
import { useUserBuckets } from '@/lib/user-buckets';
import { useArchiveTerm, useRestoreTerm } from '../api/archive-term';
import { useBucketFeed } from '../api/get-bucket-feed';
import { useUpdateTermSense } from '../api/update-term-sense';
import { BucketTable } from '../components/BucketTable';
import { BulkActionBar } from '../components/BulkActionBar';
import { type ColumnMeta, getColumns } from '../components/columns';
import { MoveToBucketDialog } from '../components/MoveToBucketDialog';
import { TermDetailSheet } from '../components/TermDetailSheet';
import type { BucketFeedItem } from '../types';

function BucketLoadingState() {
	return (
		<div className="w-full space-y-4">
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Link to="/dashboard">Home</Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>Buckets</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			<Card>
				<CardContent className="flex items-center justify-center py-12">
					<span className="text-zinc-400">Loading...</span>
				</CardContent>
			</Card>
		</div>
	);
}

function BucketNotFoundError({ userBuckets }: { userBuckets: Array<{ name: string }> }) {
	return (
		<div className="w-full space-y-4">
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Link to="/dashboard">Home</Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>Buckets</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			<Card>
				<CardContent className="flex flex-col items-center justify-center py-12 text-center">
					<p className="text-zinc-400">Bucket not found.</p>
					{userBuckets.length > 0 && <p className="text-zinc-500 text-sm mt-2">Valid buckets: {userBuckets.map((b) => b.name).join(', ')}</p>}
				</CardContent>
			</Card>
		</div>
	);
}

function FeedLoadingState({ title }: { title: string }) {
	return (
		<div className="w-full space-y-4">
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Link to="/dashboard">Home</Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<span className="text-muted-foreground">Buckets</span>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>{title}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			<Card>
				<CardHeader>
					<CardTitle>{title}</CardTitle>
				</CardHeader>
				<CardContent className="flex items-center justify-center py-12">
					<span className="text-zinc-400">Loading...</span>
				</CardContent>
			</Card>
		</div>
	);
}

function FeedErrorState({ title, error, onRetry }: { title: string; error: unknown; onRetry: () => void }) {
	const errorMessage =
		error instanceof Error && error.message.includes('401')
			? 'Your session has expired. Please sign in again.'
			: 'Something went wrong. Please try again.';

	return (
		<div className="w-full space-y-4">
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Link to="/dashboard">Home</Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<span className="text-muted-foreground">Buckets</span>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>{title}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			<Card>
				<CardHeader>
					<CardTitle>{title}</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col items-center justify-center py-12 text-center">
					<p className="text-zinc-400">{errorMessage}</p>
					<Button variant="secondary" onClick={onRetry} className="mt-4">
						Retry
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}

function FeedEmptyState({ title }: { title: string }) {
	return (
		<div className="w-full space-y-4">
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Link to="/dashboard">Home</Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<span className="text-muted-foreground">Buckets</span>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>{title}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			<Card>
				<CardHeader>
					<CardTitle>{title}</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col items-center justify-center py-12 text-center">
					<p className="text-zinc-400">No items yet.</p>
				</CardContent>
			</Card>
		</div>
	);
}

function FeedContent({
	title,
	items,
	hasNextPage,
	isFetchingNextPage,
	onFetchNextPage,
	selectedTermId,
	onRowClick,
	onClosePanel,
	rowSelection,
	onRowSelectionChange,
	onDelete,
	onMove,
	onClearSelection,
	onBulkDelete,
	onBulkMove,
}: {
	title: string;
	items: BucketFeedItem[];
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	onFetchNextPage: () => void;
	selectedTermId: string | null;
	onRowClick: (item: BucketFeedItem) => void;
	onClosePanel: () => void;
	rowSelection: RowSelectionState;
	onRowSelectionChange: (selection: RowSelectionState) => void;
	onDelete: (item: BucketFeedItem) => void;
	onMove: (item: BucketFeedItem) => void;
	onClearSelection: () => void;
	onBulkDelete: () => void;
	onBulkMove: () => void;
}) {
	const [searchQuery, setSearchQuery] = useState('');
	const deferredQuery = useDeferredValue(searchQuery);

	const filteredItems = useMemo(() => {
		if (!deferredQuery.trim()) return items;
		const query = deferredQuery.toLowerCase();
		return items.filter((item) => item.displayTerm.toLowerCase().includes(query) || item.primarySense.text.toLowerCase().includes(query));
	}, [items, deferredQuery]);

	const isFiltering = searchQuery !== deferredQuery;

	const columnMeta: ColumnMeta = useMemo(() => ({ onDelete, onMove }), [onDelete, onMove]);
	const columns = useMemo(() => getColumns(columnMeta), [columnMeta]);
	const selectedCount = Object.keys(rowSelection).length;

	return (
		<>
			<div className="w-full space-y-4">
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem>
							<BreadcrumbLink asChild>
								<Link to="/dashboard">Home</Link>
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<span className="text-muted-foreground">Buckets</span>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage>{title}</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>

				<Card>
					<CardHeader>
						<CardTitle>{title}</CardTitle>
						<CardDescription>
							{items.length} item{items.length !== 1 ? 's' : ''}
							{hasNextPage ? ' (more available)' : ''}
						</CardDescription>
					</CardHeader>

					<CardContent>
						{/* Search input */}
						<div className="relative">
							<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
							<Input
								type="search"
								placeholder="Filter items..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="pl-9"
							/>
						</div>

						{/* Filtered count */}
						{searchQuery && (
							<div className="flex items-center gap-2 text-sm text-zinc-500 mt-4">
								{isFiltering && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
								<span>{isFiltering ? 'Filtering...' : `${filteredItems.length} of ${items.length} items`}</span>
							</div>
						)}

						{/* Table */}
						<div className="mt-4">
							<BucketTable
								columns={columns}
								data={filteredItems}
								onRowClick={onRowClick}
								rowSelection={rowSelection}
								onRowSelectionChange={onRowSelectionChange}
							/>
						</div>

						{/* Load more button */}
						{hasNextPage && (
							<div className="mt-6 flex justify-center">
								<Button variant="secondary" onClick={onFetchNextPage} disabled={isFetchingNextPage}>
									{isFetchingNextPage && <Loader2 className="size-4 animate-spin mr-2" />}
									Load more
								</Button>
							</div>
						)}

						{/* Term detail sheet */}
						<TermDetailSheet termId={selectedTermId} onClose={onClosePanel} />
					</CardContent>
				</Card>

				{/* Bulk action bar */}
				<BulkActionBar selectedCount={selectedCount} onClear={onClearSelection} onBulkDelete={onBulkDelete} onBulkMove={onBulkMove} />
			</div>
		</>
	);
}

interface MoveDialogState {
	open: boolean;
	items: BucketFeedItem[];
}

export function BucketFeedPage() {
	const { slug } = useParams({ from: '/_protected/bucket/$slug' });
	const search = useSearch({ from: '/_protected/bucket/$slug' });
	const navigate = useNavigate();

	const selectedTermId = search.term ?? null;
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const [moveDialog, setMoveDialog] = useState<MoveDialogState>({ open: false, items: [] });

	// Mutations
	const archiveTerm = useArchiveTerm();
	const restoreTerm = useRestoreTerm();
	const updateTermSense = useUpdateTermSense();

	const handleRowClick = (item: BucketFeedItem) => {
		navigate({ to: '/bucket/$slug', params: { slug }, search: { term: item.termId } });
	};

	const handleClosePanel = () => {
		navigate({ to: '/bucket/$slug', params: { slug }, search: { term: undefined } });
	};

	// Delete a single term with Undo
	const handleDelete = async (item: BucketFeedItem) => {
		try {
			const result = await archiveTerm.mutateAsync({
				termId: item.termId,
				expectedVersion: item.termVersion,
			});

			toast.success('Term deleted', {
				action: {
					label: 'Undo',
					onClick: async () => {
						try {
							await restoreTerm.mutateAsync({
								termId: item.termId,
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
			} else {
				toast.error('Delete failed');
			}
		}
	};

	// Open move dialog for a single term
	const handleMove = (item: BucketFeedItem) => {
		setMoveDialog({ open: true, items: [item] });
	};

	const handleClearSelection = () => {
		setRowSelection({});
	};

	// Bulk delete with single Undo toast
	const handleBulkDelete = async () => {
		const selectedItems = items.filter((item) => rowSelection[item.termId]);
		if (selectedItems.length === 0) return;

		const results: Array<{ termId: string; version: number }> = [];
		let failedCount = 0;

		for (const item of selectedItems) {
			try {
				const result = await archiveTerm.mutateAsync({
					termId: item.termId,
					expectedVersion: item.termVersion,
				});
				results.push({ termId: item.termId, version: result.term.version });
			} catch (error) {
				console.error('Failed to archive term:', item.termId, error);
				failedCount++;
			}
		}

		setRowSelection({});

		if (results.length === 0) {
			// All failed
			toast.error('Delete failed. Please refresh and try again.');
		} else if (failedCount > 0) {
			// Partial success - show Undo for successful items
			toast.success(`${results.length} deleted, ${failedCount} failed`, {
				action: {
					label: 'Undo',
					onClick: async () => {
						let restored = 0;
						for (const { termId, version } of results) {
							try {
								await restoreTerm.mutateAsync({ termId, expectedVersion: version });
								restored++;
							} catch {
								// Continue with other restores
							}
						}
						if (restored === results.length) {
							toast.success('Restored');
						} else {
							toast.error(`Only restored ${restored} of ${results.length}`);
						}
					},
				},
			});
		} else {
			// Full success
			toast.success(`${results.length} ${results.length === 1 ? 'term' : 'terms'} deleted`, {
				action: {
					label: 'Undo',
					onClick: async () => {
						let restored = 0;
						for (const { termId, version } of results) {
							try {
								await restoreTerm.mutateAsync({ termId, expectedVersion: version });
								restored++;
							} catch {
								// Continue with other restores
							}
						}
						if (restored === results.length) {
							toast.success('Restored');
						} else {
							toast.error(`Only restored ${restored} of ${results.length}`);
						}
					},
				},
			});
		}
	};

	// Open move dialog for bulk move
	const handleBulkMove = () => {
		const selectedItems = items.filter((item) => rowSelection[item.termId]);
		if (selectedItems.length === 0) return;
		setMoveDialog({ open: true, items: selectedItems });
	};

	// Handle move confirmation
	const handleMoveConfirm = async (targetBucket: string) => {
		const itemsToMove = moveDialog.items;
		const results: Array<{ senseId: string; previousBucket: string; version: number }> = [];
		let failedCount = 0;

		for (const item of itemsToMove) {
			try {
				const result = await updateTermSense.mutateAsync({
					senseId: item.primarySense.id,
					request: {
						expectedVersion: item.primarySense.version,
						bucket: targetBucket,
					},
				});
				results.push({
					senseId: item.primarySense.id,
					previousBucket: item.primarySense.bucket,
					version: result.sense.version,
				});
			} catch (error) {
				console.error('Failed to move term sense:', item.primarySense.id, error);
				failedCount++;
			}
		}

		setMoveDialog({ open: false, items: [] });
		setRowSelection({});

		if (results.length === 0) {
			// All failed
			toast.error('Move failed. Please refresh and try again.');
		} else if (failedCount > 0) {
			// Partial success - show Undo for successful items
			toast.success(`${results.length} moved, ${failedCount} failed`, {
				action: {
					label: 'Undo',
					onClick: async () => {
						let restored = 0;
						for (const { senseId, previousBucket, version } of results) {
							try {
								await updateTermSense.mutateAsync({
									senseId,
									request: { expectedVersion: version, bucket: previousBucket },
								});
								restored++;
							} catch {
								// Continue with other restores
							}
						}
						if (restored === results.length) {
							toast.success('Moved back');
						} else {
							toast.error(`Only moved back ${restored} of ${results.length}`);
						}
					},
				},
			});
		} else {
			// Full success
			toast.success(`${results.length} ${results.length === 1 ? 'term' : 'terms'} moved`, {
				action: {
					label: 'Undo',
					onClick: async () => {
						let restored = 0;
						for (const { senseId, previousBucket, version } of results) {
							try {
								await updateTermSense.mutateAsync({
									senseId,
									request: { expectedVersion: version, bucket: previousBucket },
								});
								restored++;
							} catch {
								// Continue with other restores
							}
						}
						if (restored === results.length) {
							toast.success('Moved back');
						} else {
							toast.error(`Only moved back ${restored} of ${results.length}`);
						}
					},
				},
			});
		}
	};

	const { data: bucketsData, isLoading: bucketsLoading } = useUserBuckets();
	const userBuckets = bucketsData?.buckets ?? [];

	const matchedBucket = userBuckets.find((b) => b.slug === slug);
	const isValidBucket = !!matchedBucket;
	const title = matchedBucket?.name ?? '';

	const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useBucketFeed(slug, {
		enabled: isValidBucket && !bucketsLoading,
	});

	if (bucketsLoading) return <BucketLoadingState />;
	if (!isValidBucket) return <BucketNotFoundError userBuckets={userBuckets} />;

	const items = data?.pages.flatMap((page) => page.items) ?? [];

	if (isLoading) return <FeedLoadingState title={title} />;
	if (isError) return <FeedErrorState title={title} error={error} onRetry={refetch} />;
	if (items.length === 0) return <FeedEmptyState title={title} />;

	return (
		<>
			<FeedContent
				title={title}
				items={items}
				hasNextPage={!!hasNextPage}
				isFetchingNextPage={isFetchingNextPage}
				onFetchNextPage={fetchNextPage}
				selectedTermId={selectedTermId}
				onRowClick={handleRowClick}
				onClosePanel={handleClosePanel}
				rowSelection={rowSelection}
				onRowSelectionChange={setRowSelection}
				onDelete={handleDelete}
				onMove={handleMove}
				onClearSelection={handleClearSelection}
				onBulkDelete={handleBulkDelete}
				onBulkMove={handleBulkMove}
			/>

			<MoveToBucketDialog
				open={moveDialog.open}
				onClose={() => setMoveDialog({ open: false, items: [] })}
				onConfirm={handleMoveConfirm}
				currentBucket={slug}
				itemCount={moveDialog.items.length}
				isPending={updateTermSense.isPending}
			/>
		</>
	);
}

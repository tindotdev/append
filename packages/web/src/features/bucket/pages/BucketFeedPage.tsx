import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import type { RowSelectionState } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useUserBuckets } from '@/lib/user-buckets';
import { useBucketFeed } from '../api/get-bucket-feed';
import { BucketTable } from '../components/BucketTable';
import { type ColumnMeta, getColumns } from '../components/columns';
import { TermDetailSheet } from '../components/TermDetailSheet';
import type { BucketFeedItem } from '../types';

function BucketLoadingState() {
	return (
		<div className="max-w-4xl">
			<div className="flex items-center justify-center py-12">
				<span className="text-zinc-400">Loading...</span>
			</div>
		</div>
	);
}

function BucketNotFoundError({ userBuckets }: { userBuckets: Array<{ name: string }> }) {
	return (
		<div className="max-w-4xl">
			<div className="flex flex-col items-center justify-center py-12 text-center">
				<p className="text-zinc-400">Bucket not found.</p>
				{userBuckets.length > 0 && <p className="text-zinc-500 text-sm mt-2">Valid buckets: {userBuckets.map((b) => b.name).join(', ')}</p>}
			</div>
		</div>
	);
}

function FeedLoadingState({ title }: { title: string }) {
	return (
		<div className="max-w-4xl">
			<h2 className="text-xl font-semibold">{title}</h2>
			<div className="flex items-center justify-center py-12">
				<span className="text-zinc-400">Loading...</span>
			</div>
		</div>
	);
}

function FeedErrorState({ title, error, onRetry }: { title: string; error: unknown; onRetry: () => void }) {
	const errorMessage =
		error instanceof Error && error.message.includes('401')
			? 'Your session has expired. Please sign in again.'
			: 'Something went wrong. Please try again.';

	return (
		<div className="max-w-4xl">
			<h2 className="text-xl font-semibold">{title}</h2>
			<div className="flex flex-col items-center justify-center py-12 text-center">
				<p className="text-zinc-400">{errorMessage}</p>
				<button type="button" onClick={onRetry} className="mt-4 px-4 py-2 bg-zinc-800 text-white rounded hover:bg-zinc-700 transition-colors">
					Retry
				</button>
			</div>
		</div>
	);
}

function FeedEmptyState({ title }: { title: string }) {
	return (
		<div className="max-w-4xl">
			<h2 className="text-xl font-semibold">{title}</h2>
			<div className="flex flex-col items-center justify-center py-12 text-center">
				<p className="text-zinc-400">No items yet.</p>
			</div>
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

	return (
		<div className="max-w-4xl">
			<h2 className="text-xl font-semibold">{title}</h2>
			<p className="text-sm text-zinc-500 mt-1">
				{items.length} item{items.length !== 1 ? 's' : ''}
				{hasNextPage ? ' (more available)' : ''}
			</p>

			{/* Search input */}
			<div className="mt-4 relative">
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
				<p className="text-sm text-zinc-500 mt-2">{isFiltering ? 'Filtering...' : `${filteredItems.length} of ${items.length} items`}</p>
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

			{hasNextPage && (
				<div className="mt-6 flex justify-center">
					<button
						type="button"
						onClick={onFetchNextPage}
						disabled={isFetchingNextPage}
						className="px-4 py-2 bg-zinc-800 text-white rounded hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
					>
						{isFetchingNextPage && <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
						Load more
					</button>
				</div>
			)}

			{/* Term detail sheet */}
			<TermDetailSheet termId={selectedTermId} onClose={onClosePanel} />
		</div>
	);
}

export function BucketFeedPage() {
	const { slug } = useParams({ from: '/protected/bucket/$slug' });
	const search = useSearch({ from: '/protected/bucket/$slug' });
	const navigate = useNavigate();

	const selectedTermId = search.term ?? null;
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

	const handleRowClick = (item: BucketFeedItem) => {
		navigate({ to: '/bucket/$slug', params: { slug }, search: { term: item.termId } });
	};

	const handleClosePanel = () => {
		navigate({ to: '/bucket/$slug', params: { slug }, search: { term: undefined } });
	};

	// Stub handlers - will be wired to mutations in a later task
	const handleDelete = (_item: BucketFeedItem) => {
		// TODO: Wire to useArchiveTerm mutation with Undo toast
	};

	const handleMove = (_item: BucketFeedItem) => {
		// TODO: Open MoveToBucketDialog
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
		/>
	);
}

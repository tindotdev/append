import { useParams } from '@tanstack/react-router';
import { useUserBuckets } from '@/features/settings';
import { useBucketFeed } from '../api/get-bucket-feed';

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

interface FeedItem {
	termId: string;
	displayTerm: string;
	primarySense: { text: string };
}

function FeedContent({
	title,
	items,
	hasNextPage,
	isFetchingNextPage,
	onFetchNextPage,
}: {
	title: string;
	items: FeedItem[];
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	onFetchNextPage: () => void;
}) {
	return (
		<div className="max-w-4xl">
			<h2 className="text-xl font-semibold">{title}</h2>
			<p className="text-sm text-zinc-500 mt-1">
				{items.length} item{items.length !== 1 ? 's' : ''}
				{hasNextPage ? ' (more available)' : ''}
			</p>

			<div className="mt-6 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
				{items.map((item) => (
					<div key={item.termId} className="p-4">
						<p className="text-white font-medium">{item.displayTerm}</p>
						<p className="text-zinc-400 text-sm mt-1">{item.primarySense.text}</p>
					</div>
				))}
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
		</div>
	);
}

export function BucketFeedPage() {
	const { slug } = useParams({ from: '/protected/bucket/$slug' });

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
		/>
	);
}

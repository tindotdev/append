import { useParams } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import {
  ApiRequestError,
  Bucket,
  BucketFeedItem,
  getBucketFeed,
} from "../lib/api";

/** Valid bucket slugs */
const VALID_BUCKETS: Bucket[] = [
  "foundations",
  "backend",
  "frontend",
  "dx-tooling",
  "deep-concepts",
];

/** Bucket slug to display title mapping */
const BUCKET_TITLES: Record<Bucket, string> = {
  foundations: "Foundations",
  backend: "Backend",
  frontend: "Frontend",
  "dx-tooling": "DX Tooling",
  "deep-concepts": "Deep Concepts",
};

function isValidBucket(slug: string): slug is Bucket {
  return VALID_BUCKETS.includes(slug as Bucket);
}

export function BucketFeedPage() {
  const { slug } = useParams({ from: "/protected/bucket/$slug" });

  const [items, setItems] = useState<BucketFeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validate slug
  if (!isValidBucket(slug)) {
    return (
      <div className="max-w-4xl">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-zinc-400">Bucket not found.</p>
          <p className="text-zinc-500 text-sm mt-2">
            Valid buckets: {VALID_BUCKETS.join(", ")}
          </p>
        </div>
      </div>
    );
  }

  const bucket = slug as Bucket;
  const title = BUCKET_TITLES[bucket];

  const fetchInitialPage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getBucketFeed(bucket);
      setItems(response.items);
      setNextCursor(response.nextCursor);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.status === 401) {
          setError("Your session has expired. Please sign in again.");
        } else {
          setError("Something went wrong. Please try again.");
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [bucket]);

  const loadMore = async () => {
    if (!nextCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const response = await getBucketFeed(bucket, { cursor: nextCursor });
      setItems((prev) => [...prev, ...response.items]);
      setNextCursor(response.nextCursor);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError("Failed to load more items. Please try again.");
      } else {
        setError("Failed to load more items. Please try again.");
      }
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchInitialPage();
  }, [fetchInitialPage]);

  // Loading state
  if (isLoading) {
    return (
      <div className="max-w-4xl">
        <h2 className="text-xl font-semibold">{title}</h2>
        <div className="flex items-center justify-center py-12">
          <span className="text-zinc-400">Loading...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-4xl">
        <h2 className="text-xl font-semibold">{title}</h2>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-zinc-400">{error}</p>
          <button
            onClick={() => {
              setError(null);
              fetchInitialPage();
            }}
            className="mt-4 px-4 py-2 bg-zinc-800 text-white rounded hover:bg-zinc-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div className="max-w-4xl">
        <h2 className="text-xl font-semibold">{title}</h2>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-zinc-400">No items yet.</p>
        </div>
      </div>
    );
  }

  // Feed list
  return (
    <div className="max-w-4xl">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-sm text-zinc-500 mt-1">
        {items.length} item{items.length !== 1 ? "s" : ""}
        {nextCursor ? " (more available)" : ""}
      </p>

      {/* Items list */}
      <div className="mt-6 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
        {items.map((item) => (
          <div key={item.termId} className="p-4">
            <p className="text-white font-medium">{item.displayTerm}</p>
            <p className="text-zinc-400 text-sm mt-1">
              {item.primarySense.text}
            </p>
          </div>
        ))}
      </div>

      {/* Load more button */}
      {nextCursor && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={loadMore}
            disabled={isLoadingMore}
            className="px-4 py-2 bg-zinc-800 text-white rounded hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isLoadingMore && (
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            )}
            Load more
          </button>
        </div>
      )}
    </div>
  );
}

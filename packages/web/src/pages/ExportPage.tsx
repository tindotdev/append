import { useState } from "react";
import { Bucket, downloadBucketExport, DownloadResult } from "../lib/api";

/** Buckets in fixed download order */
const BUCKETS: Bucket[] = [
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

type BucketResult = DownloadResult | null;

interface ExportState {
  isDownloading: boolean;
  currentBucket: Bucket | null;
  results: Record<Bucket, BucketResult>;
}

const initialState: ExportState = {
  isDownloading: false,
  currentBucket: null,
  results: {
    foundations: null,
    backend: null,
    frontend: null,
    "dx-tooling": null,
    "deep-concepts": null,
  },
};

export function ExportPage() {
  const [state, setState] = useState<ExportState>(initialState);

  const downloadSingle = async (bucket: Bucket) => {
    setState((prev) => ({
      ...prev,
      isDownloading: true,
      currentBucket: bucket,
      results: { ...prev.results, [bucket]: null },
    }));

    const result = await downloadBucketExport(bucket);

    setState((prev) => ({
      ...prev,
      isDownloading: false,
      currentBucket: null,
      results: { ...prev.results, [bucket]: result },
    }));
  };

  const downloadAll = async () => {
    // Reset all results
    setState({
      isDownloading: true,
      currentBucket: null,
      results: initialState.results,
    });

    const newResults = { ...initialState.results };

    // Download sequentially to preserve order
    for (const bucket of BUCKETS) {
      setState((prev) => ({ ...prev, currentBucket: bucket }));
      const result = await downloadBucketExport(bucket);
      newResults[bucket] = result;
      // Update state after each download to show progress
      setState((prev) => ({
        ...prev,
        results: { ...prev.results, [bucket]: result },
      }));
    }

    setState((prev) => ({
      ...prev,
      isDownloading: false,
      currentBucket: null,
    }));
  };

  const hasAnyResults = Object.values(state.results).some((r) => r !== null);
  const successCount = Object.values(state.results).filter(
    (r) => r?.success
  ).length;
  const failureCount = Object.values(state.results).filter(
    (r) => r && !r.success
  ).length;

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold">Export</h2>
      <p className="text-sm text-zinc-500 mt-1">
        Download your terms as markdown files, one per bucket.
      </p>

      {/* Download All button */}
      <div className="mt-6">
        <button
          onClick={downloadAll}
          disabled={state.isDownloading}
          className="w-full px-4 py-3 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {state.isDownloading && state.currentBucket === null ? (
            <>
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              Starting download...
            </>
          ) : state.isDownloading ? (
            <>
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              Downloading {BUCKET_TITLES[state.currentBucket!]}...
            </>
          ) : (
            <>Download all (5 files)</>
          )}
        </button>
      </div>

      {/* Summary after Download All */}
      {hasAnyResults && !state.isDownloading && (
        <div className="mt-4 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
          <p className="text-sm text-zinc-400">
            {failureCount === 0 ? (
              <span className="text-green-400">
                All {successCount} files downloaded successfully.
              </span>
            ) : (
              <>
                <span className="text-green-400">
                  {successCount} succeeded
                </span>
                {", "}
                <span className="text-red-400">{failureCount} failed</span>
              </>
            )}
          </p>
        </div>
      )}

      {/* Per-bucket download buttons */}
      <div className="mt-6 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
        {BUCKETS.map((bucket) => {
          const result = state.results[bucket];
          const isCurrentlyDownloading =
            state.isDownloading && state.currentBucket === bucket;

          return (
            <div
              key={bucket}
              className="p-4 flex items-center justify-between"
            >
              <div>
                <p className="text-white font-medium">
                  {BUCKET_TITLES[bucket]}
                </p>
                <p className="text-zinc-500 text-sm">{bucket}.md</p>
                {result && (
                  <p
                    className={`text-xs mt-1 ${result.success ? "text-green-400" : "text-red-400"}`}
                  >
                    {result.success ? "Downloaded" : result.error}
                  </p>
                )}
              </div>
              <button
                onClick={() => downloadSingle(bucket)}
                disabled={state.isDownloading}
                className="px-3 py-1.5 text-sm bg-zinc-800 text-white rounded hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isCurrentlyDownloading ? (
                  <>
                    <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                    Downloading...
                  </>
                ) : (
                  "Download"
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

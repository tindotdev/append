import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ApiRequestError, BatchResponse, getBatch } from "../lib/api";

export function BatchDetailPage() {
  const { batchId } = useParams({ from: "/protected/batch/$batchId" });
  const [batch, setBatch] = useState<BatchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBatch() {
      try {
        const data = await getBatch(batchId);
        setBatch(data);
      } catch (err) {
        if (err instanceof ApiRequestError) {
          if (err.code === "NOT_FOUND") {
            setError("Batch not found.");
          } else if (err.code === "FORBIDDEN") {
            setError("You don't have access to this batch.");
          } else if (err.code === "UNAUTHORIZED") {
            setError("Your session has expired. Please sign in again.");
          } else {
            setError(err.message);
          }
        } else {
          setError("Failed to load batch.");
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchBatch();
  }, [batchId]);

  if (isLoading) {
    return (
      <div className="max-w-2xl">
        <p className="text-zinc-400">Loading batch...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl">
        <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-400">
          {error}
        </div>
        <Link
          to="/batch/new"
          className="mt-4 inline-block text-zinc-400 hover:text-white transition-colors"
        >
          ← Create new batch
        </Link>
      </div>
    );
  }

  if (!batch) {
    return null;
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Batch Review</h2>
        <span className="text-sm text-zinc-500">
          {batch.candidateCount} candidate{batch.candidateCount !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-3 text-sm text-zinc-500">
        <span className="px-2 py-0.5 bg-zinc-800 rounded text-xs uppercase tracking-wide">
          {batch.status}
        </span>
        <span>Created {new Date(batch.createdAt).toLocaleDateString()}</span>
      </div>

      <div className="mt-6 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
        {batch.candidates.map((candidate, index) => (
          <div key={candidate.id} className="p-4 flex items-start gap-4">
            <span className="text-zinc-600 text-sm font-mono w-6 text-right flex-shrink-0">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-white">{candidate.term}</p>
              {candidate.term !== candidate.normalizedTerm && (
                <p className="text-zinc-500 text-sm mt-0.5">
                  → {candidate.normalizedTerm}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
        <p className="text-zinc-400 text-sm">
          Suggestions and accept actions will be available in Step 3.
        </p>
      </div>

      <Link
        to="/batch/new"
        className="mt-6 inline-block text-zinc-400 hover:text-white transition-colors"
      >
        ← Create another batch
      </Link>
    </div>
  );
}

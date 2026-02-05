import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, parseRpcJson } from '@/lib/api-rpc';
import { useTryExportTermsForSync } from '../hooks';
import { clearTryState } from '../store';

type SyncState = 'idle' | 'syncing' | 'done' | 'error';
type GuestImportItem = ReturnType<typeof useTryExportTermsForSync>[number];

const IMPORT_TERMS_BATCH_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}
	return chunks;
}

function ensureRequestId(requestIds: string[], batchIndex: number): string {
	const existing = requestIds[batchIndex];
	if (existing) return existing;
	const created = crypto.randomUUID();
	requestIds[batchIndex] = created;
	return created;
}

type SyncResult = { status: 'completed' } | { status: 'cancelled' } | { status: 'failed'; batchIndex: number; error: unknown };

async function syncGuestImportBatches(opts: {
	batches: GuestImportItem[][];
	requestIds: string[];
	startBatchIndex: number;
	isCancelled: () => boolean;
	onBatchStart: (batchIndex: number) => void;
	onBatchSuccess: (batchIndex: number, batchSize: number) => void;
}): Promise<SyncResult> {
	const { batches, requestIds, startBatchIndex, isCancelled, onBatchStart, onBatchSuccess } = opts;

	for (let i = startBatchIndex; i < batches.length; i += 1) {
		if (isCancelled()) return { status: 'cancelled' };

		onBatchStart(i);
		const batch = batches[i] as GuestImportItem[];
		const requestId = ensureRequestId(requestIds, i);

		try {
			const res = await api.api.guest['import-terms'].$post({
				json: { clientRequestId: requestId, items: batch },
			});
			await parseRpcJson(res);
		} catch (error) {
			return { status: 'failed', batchIndex: i, error };
		}

		if (isCancelled()) return { status: 'cancelled' };
		onBatchSuccess(i, batch.length);
	}

	return { status: 'completed' };
}

function sumBatchSizesBefore(batches: Array<{ length: number }>, batchIndex: number): number {
	let total = 0;
	for (let i = 0; i < batchIndex && i < batches.length; i += 1) {
		total += batches[i]?.length ?? 0;
	}
	return total;
}

export function TrySyncPage() {
	const navigate = useNavigate();
	const { auth } = useRouteContext({ from: '__root__' });
	const { data: session, isPending } = auth;
	const items = useTryExportTermsForSync();

	const [state, setState] = useState<SyncState>('idle');
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [syncedCount, setSyncedCount] = useState(0);
	const [totalCount, setTotalCount] = useState(0);
	const [totalBatches, setTotalBatches] = useState(0);
	const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
	const [failedBatchIndex, setFailedBatchIndex] = useState<number | null>(null);

	const startedRef = useRef(false);
	const runIdRef = useRef(0);
	const batchesRef = useRef<GuestImportItem[][]>([]);
	const requestIdsRef = useRef<string[]>([]);

	const isSyncing = state === 'syncing';

	const run = useCallback(
		async (startBatchIndex: number) => {
			runIdRef.current += 1;
			const runId = runIdRef.current;

			setState('syncing');
			setErrorMessage(null);
			setFailedBatchIndex(null);

			const batches = batchesRef.current;
			const requestIds = requestIdsRef.current;

			let syncedSoFar = sumBatchSizesBefore(batches, startBatchIndex);
			setSyncedCount(syncedSoFar);

			const result = await syncGuestImportBatches({
				batches,
				requestIds,
				startBatchIndex,
				isCancelled: () => runIdRef.current !== runId,
				onBatchStart: (batchIndex) => setCurrentBatchIndex(batchIndex),
				onBatchSuccess: (_batchIndex, batchSize) => {
					syncedSoFar += batchSize;
					setSyncedCount(syncedSoFar);
				},
			});

			if (result.status === 'cancelled') return;

			if (result.status === 'failed') {
				setState('error');
				setFailedBatchIndex(result.batchIndex);
				setErrorMessage(result.error instanceof Error ? result.error.message : 'Sync failed');
				return;
			}

			clearTryState();
			setState('done');
			navigate({ to: '/bucket/$slug', params: { slug: 'foundations' }, search: { term: undefined } });
		},
		[navigate]
	);

	useEffect(() => {
		if (startedRef.current) return;
		if (isPending) return;

		if (!session) {
			navigate({ to: '/sign-in' });
			return;
		}

		startedRef.current = true;

		if (items.length === 0) {
			navigate({ to: '/batch' });
			return;
		}

		const batches = chunk(items, IMPORT_TERMS_BATCH_SIZE);
		batchesRef.current = batches;
		requestIdsRef.current = batches.map(() => crypto.randomUUID());

		setTotalCount(items.length);
		setTotalBatches(batches.length);
		setSyncedCount(0);
		setCurrentBatchIndex(0);

		void run(0);
	}, [isPending, items, navigate, run, session]);

	const retry = useCallback(() => {
		void run(failedBatchIndex ?? 0);
	}, [failedBatchIndex, run]);

	return (
		<div className="w-full">
			<Card>
				<CardHeader>
					<CardTitle>Syncing trial data</CardTitle>
					<CardDescription>Importing your local trial terms into your new account…</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="text-sm text-muted-foreground">
						Terms to sync: <span className="text-foreground tabular-nums">{totalCount}</span>
					</div>

					<div className="text-sm text-muted-foreground">
						Synced: <span className="text-foreground tabular-nums">{syncedCount}</span> /{' '}
						<span className="text-foreground tabular-nums">{totalCount}</span>
					</div>

					{state === 'syncing' && totalBatches > 0 && (
						<div className="text-sm">
							Syncing batch <span className="tabular-nums">{Math.min(currentBatchIndex + 1, totalBatches)}</span> /{' '}
							<span className="tabular-nums">{totalBatches}</span>…
						</div>
					)}

					{state === 'error' && (
						<div className="space-y-2">
							<div className="text-sm text-destructive">{errorMessage ?? 'Sync failed.'}</div>
							{typeof failedBatchIndex === 'number' && totalBatches > 0 && (
								<div className="text-sm text-muted-foreground">
									Failed on batch <span className="tabular-nums">{failedBatchIndex + 1}</span> / <span className="tabular-nums">{totalBatches}</span>
									.
								</div>
							)}
							<div className="flex gap-2">
								<Button onClick={retry} disabled={isSyncing}>
									Retry
								</Button>
								<Button variant="outline" onClick={() => navigate({ to: '/try' })}>
									Back to trial
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

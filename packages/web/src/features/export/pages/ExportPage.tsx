import { BUCKET_TITLES, BUCKETS, type Bucket } from '@append/contracts/types';
import { Link } from '@tanstack/react-router';
import { Download, Minus, Shield } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { type DownloadResult, downloadBucketExport } from '../api/download-export';
import { BucketDetailDrawer } from '../components/BucketDetailDrawer';
import { ExportHistory } from '../components/ExportHistory';
import { RawEventsExport } from '../components/RawEventsExport';

type BucketResult = DownloadResult | null;

interface ExportState {
	isDownloading: boolean;
	currentBucket: Bucket | null;
	results: Record<Bucket, BucketResult>;
}

const emptyResults = (): Record<Bucket, BucketResult> =>
	Object.fromEntries(BUCKETS.map((bucket) => [bucket, null])) as Record<Bucket, BucketResult>;

const initialState: ExportState = {
	isDownloading: false,
	currentBucket: null,
	results: emptyResults(),
};

export function ExportPage() {
	const [state, setState] = useState<ExportState>(initialState);
	const [selectedBucket, setSelectedBucket] = useState<Bucket | null>(null);

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
		const resetResults = emptyResults();
		setState({
			isDownloading: true,
			currentBucket: null,
			results: resetResults,
		});

		const newResults = { ...resetResults };

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
	const successCount = Object.values(state.results).filter((r) => r?.success).length;
	const failureCount = Object.values(state.results).filter((r) => r && !r.success).length;

	return (
		<div className="max-w-2xl space-y-4">
			<div>
				<h2 className="text-2xl font-semibold">Export</h2>
				<div className="flex items-center justify-between">
					<p className="text-sm text-muted-foreground mt-1">Export your data in various formats.</p>
					<Link to="/privacy" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5">
						<Shield className="size-3.5" />
						Privacy
					</Link>
				</div>
			</div>

			{/* Raw Events Export */}
			<RawEventsExport />

			{/* Terms Bucket Export */}
			<Card>
				<CardHeader>
					<CardTitle>Terms (Markdown)</CardTitle>
					<CardDescription>Download your terms as markdown files, one per bucket.</CardDescription>
					<CardAction>
						<Button
							size="sm"
							onClick={downloadAll}
							disabled={state.isDownloading}
							title={
								state.isDownloading && state.currentBucket === null
									? 'Starting download...'
									: state.isDownloading
										? `Downloading ${BUCKET_TITLES[state.currentBucket as keyof typeof BUCKET_TITLES]}...`
										: `Download all ${BUCKETS.length} files`
							}
						>
							{state.isDownloading && state.currentBucket === null ? (
								<span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
							) : state.isDownloading ? (
								<span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
							) : (
								<>
									<Download className="size-3.5" />({BUCKETS.length})
								</>
							)}
						</Button>
					</CardAction>
				</CardHeader>
				<CardContent className="space-y-4">
					{/* Summary after Download All */}
					{hasAnyResults && !state.isDownloading && (
						<p className="text-sm text-muted-foreground">
							{failureCount === 0 ? (
								<span className="text-green-400">✓ All {successCount} files downloaded</span>
							) : (
								<>
									<span className="text-green-400">{successCount} ✓</span>
									{', '}
									<span className="text-red-400">{failureCount} ✗</span>
								</>
							)}
						</p>
					)}

					{/* Per-bucket table */}
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[200px]">Bucket</TableHead>
								<TableHead>File</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="text-right">Action</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{BUCKETS.map((bucket) => {
								const result = state.results[bucket];
								const isCurrentlyDownloading = state.isDownloading && state.currentBucket === bucket;

								return (
									<TableRow key={bucket} onClick={() => setSelectedBucket(bucket)} className="cursor-pointer">
										<TableCell className="font-medium">{BUCKET_TITLES[bucket]}</TableCell>
										<TableCell className="text-xs text-muted-foreground">{bucket}.md</TableCell>
										<TableCell>
											{result ? (
												<span className={`text-xs ${result.success ? 'text-green-400' : 'text-red-400'}`}>
													{result.success ? '✓ Downloaded' : result.error}
												</span>
											) : (
												<Minus className="size-3.5 text-muted-foreground/40" />
											)}
										</TableCell>
										<TableCell className="text-right">
											<Button
												variant="ghost"
												size="sm"
												onClick={(e) => {
													e.stopPropagation();
													downloadSingle(bucket);
												}}
												disabled={state.isDownloading}
												title={isCurrentlyDownloading ? 'Downloading...' : 'Download'}
											>
												{isCurrentlyDownloading ? (
													<span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
												) : (
													<Download className="size-4" />
												)}
											</Button>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			{/* Export History */}
			<ExportHistory />

			{/* Bucket Detail Drawer */}
			<BucketDetailDrawer
				bucket={selectedBucket}
				onClose={() => setSelectedBucket(null)}
				onDownload={(bucket) => {
					setSelectedBucket(null);
					downloadSingle(bucket);
				}}
				isDownloading={state.isDownloading}
			/>
		</div>
	);
}

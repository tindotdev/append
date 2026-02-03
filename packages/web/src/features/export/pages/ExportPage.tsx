import { BUCKET_TITLES, BUCKETS, type Bucket } from '@append/contracts/types';
import { Link } from '@tanstack/react-router';
import { Download, Minus } from 'lucide-react';
import { useState } from 'react';
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
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

		try {
			const result = await downloadBucketExport(bucket);

			setState((prev) => ({
				...prev,
				isDownloading: false,
				currentBucket: null,
				results: { ...prev.results, [bucket]: result },
			}));
		} catch (err) {
			setState((prev) => ({
				...prev,
				isDownloading: false,
				currentBucket: null,
				results: { ...prev.results, [bucket]: { success: false, error: String(err) } },
			}));
		}
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

		try {
			// Download sequentially to preserve order
			for (const bucket of BUCKETS) {
				setState((prev) => ({ ...prev, currentBucket: bucket }));
				try {
					const result = await downloadBucketExport(bucket);
					newResults[bucket] = result;
					// Update state after each download to show progress
					setState((prev) => ({
						...prev,
						results: { ...prev.results, [bucket]: result },
					}));
				} catch (err) {
					// Single bucket failure doesn't abort entire download
					const errorResult = { success: false, error: String(err) };
					newResults[bucket] = errorResult;
					setState((prev) => ({
						...prev,
						results: { ...prev.results, [bucket]: errorResult },
					}));
				}
			}
		} finally {
			setState((prev) => ({
				...prev,
				isDownloading: false,
				currentBucket: null,
			}));
		}
	};

	const hasAnyResults = Object.values(state.results).some((r) => r !== null);
	const successCount = Object.values(state.results).filter((r) => r?.success).length;
	const failureCount = Object.values(state.results).filter((r) => r && !r.success).length;

	return (
		<div className="w-full space-y-4">
			{/* Breadcrumbs */}
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Link to="/">Home</Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>Export</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

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
							aria-label={`Download all ${BUCKETS.length} files`}
							title={
								state.isDownloading && state.currentBucket === null
									? 'Starting download...'
									: state.isDownloading
										? `Downloading ${BUCKET_TITLES[state.currentBucket as keyof typeof BUCKET_TITLES]}...`
										: `Download all ${BUCKETS.length} files`
							}
						>
							{state.isDownloading && state.currentBucket === null ? (
								<span className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-foreground" />
							) : state.isDownloading ? (
								<span className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-foreground" />
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
								<span className="text-success">✓ All {successCount} files downloaded</span>
							) : (
								<>
									<span className="text-success">{successCount} ✓</span>
									{', '}
									<span className="text-destructive">{failureCount} ✗</span>
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
												<span className={`text-xs ${result.success ? 'text-success' : 'text-destructive'}`}>
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
												aria-label={`Download ${BUCKET_TITLES[bucket]}`}
												title={isCurrentlyDownloading ? 'Downloading...' : 'Download'}
											>
												{isCurrentlyDownloading ? (
													<span className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-foreground" />
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

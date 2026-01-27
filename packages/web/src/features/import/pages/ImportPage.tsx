/**
 * Import page with state machine: idle → uploading → preview → committing → done
 */

import { Link } from '@tanstack/react-router';
import { CheckCircleIcon, Loader2, XCircleIcon } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type BucketMapping, type CommitResult, commitImport } from '../api/commit-import';
import { type PreviewResult, previewImport } from '../api/preview-import';
import { FileUploader } from '../components/FileUploader';
import { ImportHistory } from '../components/ImportHistory';

type ImportState =
	| { step: 'idle' }
	| { step: 'uploading' }
	| { step: 'loading-preview'; importId: string }
	| { step: 'preview'; importId: string; preview: PreviewResult; bucketSelections: Record<string, string> }
	| { step: 'committing'; importId: string }
	| { step: 'done'; result: CommitResult }
	| { step: 'error'; message: string };

export function ImportPage() {
	const [state, setState] = useState<ImportState>({ step: 'idle' });

	const handleFilesUploaded = async (importId: string) => {
		setState({ step: 'loading-preview', importId });

		try {
			const preview = await previewImport(importId);

			// Initialize bucket selections with suggested slugs matched to existing buckets
			const bucketSelections: Record<string, string> = {};
			for (const file of preview.parsedFiles) {
				if (file.suggestedBucketSlug) {
					const matchingBucket = preview.existingBuckets.find((b) => b.slug === file.suggestedBucketSlug);
					if (matchingBucket) {
						bucketSelections[file.r2Key] = matchingBucket.id;
					}
				}
			}

			setState({ step: 'preview', importId, preview, bucketSelections });
		} catch (error) {
			setState({ step: 'error', message: error instanceof Error ? error.message : 'Failed to load preview' });
		}
	};

	const handleBucketChange = (r2Key: string, bucketId: string) => {
		if (state.step !== 'preview') return;
		setState({
			...state,
			bucketSelections: { ...state.bucketSelections, [r2Key]: bucketId },
		});
	};

	const handleCommit = async () => {
		if (state.step !== 'preview') return;

		// Only include files with valid bucket selections (non-empty)
		const bucketMappings: BucketMapping[] = Object.entries(state.bucketSelections)
			.filter(([, bucketId]) => bucketId !== '')
			.map(([r2Key, bucketId]) => ({ r2Key, bucketId }));

		if (bucketMappings.length === 0) return;

		setState({ step: 'committing', importId: state.importId });

		try {
			const result = await commitImport(state.importId, bucketMappings);
			setState({ step: 'done', result });
		} catch (error) {
			setState({ step: 'error', message: error instanceof Error ? error.message : 'Failed to commit import' });
		}
	};

	const handleReset = () => {
		setState({ step: 'idle' });
	};

	const handleUploadError = (message: string) => {
		setState({ step: 'error', message });
	};

	return (
		<div className="w-full space-y-4">
			{/* Breadcrumbs */}
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Link to="/dashboard">Home</Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>Import</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			{/* Main Import Card */}
			<Card>
				<CardHeader>
					<CardTitle>Import</CardTitle>
					<CardDescription>Import terms from ENG-LOG markdown files.</CardDescription>
				</CardHeader>

				<CardContent>
					{/* Idle / Upload state */}
					{(state.step === 'idle' || state.step === 'uploading') && (
						<div>
							<FileUploader onFilesUploaded={handleFilesUploaded} onError={handleUploadError} disabled={state.step === 'uploading'} />
						</div>
					)}

					{/* Loading preview */}
					{state.step === 'loading-preview' && (
						<div className="flex items-center gap-3 py-8">
							<Loader2 className="size-4 animate-spin text-muted-foreground" />
							<span className="text-muted-foreground">Parsing uploaded files...</span>
						</div>
					)}

					{/* Preview state */}
					{state.step === 'preview' && (
						<div className="space-y-6">
							{/* Stats summary */}
							<div className="space-y-3">
								<h3 className="text-sm font-medium">Preview Summary</h3>
								<div className="grid grid-cols-2 gap-4 text-sm">
									<div>
										<span className="text-muted-foreground">Total entries:</span>{' '}
										<span className="text-foreground">{state.preview.stats.totalEntries}</span>
									</div>
									<div>
										<span className="text-muted-foreground">With definitions:</span>{' '}
										<span className="text-foreground">{state.preview.stats.entriesWithDefinition}</span>
									</div>
									<div>
										<span className="text-muted-foreground">Inbox (skipped):</span>{' '}
										<span className="text-muted-foreground">{state.preview.stats.inboxEntries}</span>
									</div>
									<div className="flex items-center gap-2">
										<span className="text-muted-foreground">New terms:</span>
										<Badge variant="success">{state.preview.stats.newTerms}</Badge>
									</div>
									<div className="flex items-center gap-2">
										<span className="text-muted-foreground">Existing terms:</span>
										<Badge variant="warning">{state.preview.stats.existingTerms}</Badge>
									</div>
								</div>
							</div>

							<div className="border-t border-border" />

							{/* File-to-bucket mapping */}
							<div className="space-y-3">
								<div>
									<h3 className="text-sm font-medium">Map files to buckets</h3>
									<p className="text-sm text-muted-foreground mt-1">Select which bucket each file's terms should be imported into.</p>
								</div>
								<div className="divide-y divide-border">
									{state.preview.parsedFiles.map((file) => (
										<div key={file.r2Key} className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
											<div className="flex-1 min-w-0">
												<p className="text-foreground font-medium truncate">{file.filename}</p>
												<div className="flex items-center gap-2 text-sm">
													<span className="text-muted-foreground">{file.entries.filter((e) => !e.isInbox).length} terms</span>
													{file.warnings.length > 0 && <Badge variant="warning">{file.warnings.length} warnings</Badge>}
												</div>
											</div>
											<Select value={state.bucketSelections[file.r2Key] || ''} onValueChange={(value) => handleBucketChange(file.r2Key, value)}>
												<SelectTrigger className="w-[180px]">
													<SelectValue placeholder="Select bucket..." />
												</SelectTrigger>
												<SelectContent>
													{state.preview.existingBuckets.map((bucket) => (
														<SelectItem key={bucket.id} value={bucket.id}>
															{bucket.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									))}
								</div>
							</div>

							<div className="border-t border-border" />

							{/* Action buttons */}
							<div className="flex gap-3">
								<Button
									onClick={handleCommit}
									disabled={Object.values(state.bucketSelections).filter((id) => id !== '').length === 0}
									className="flex-1"
								>
									Import {state.preview.stats.entriesWithDefinition} terms
								</Button>
								<Button variant="secondary" onClick={handleReset}>
									Cancel
								</Button>
							</div>
						</div>
					)}

					{/* Committing state */}
					{state.step === 'committing' && (
						<div className="flex items-center gap-3 py-8">
							<Loader2 className="size-4 animate-spin text-muted-foreground" />
							<span className="text-muted-foreground">Importing terms...</span>
						</div>
					)}

					{/* Done state */}
					{state.step === 'done' && (
						<div className="space-y-4">
							<Alert className="bg-success/20 border-success">
								<CheckCircleIcon className="size-4 text-success" />
								<AlertTitle className="text-success">Import complete</AlertTitle>
								<AlertDescription className="text-muted-foreground space-y-1">
									<p>Created {state.result.stats.termCreatedCount} new terms</p>
									<p>Added {state.result.stats.termSenseCreatedCount} senses</p>
									{state.result.stats.flaggedCount > 0 && (
										<p className="text-warning">{state.result.stats.flaggedCount} entries flagged for bucket conflict</p>
									)}
									{state.result.stats.skippedCount > 0 && (
										<p className="text-muted-foreground">{state.result.stats.skippedCount} duplicates skipped</p>
									)}
								</AlertDescription>
							</Alert>
							<Button variant="secondary" onClick={handleReset} className="w-full">
								Import more files
							</Button>
						</div>
					)}

					{/* Error state */}
					{state.step === 'error' && (
						<div className="space-y-4">
							<Alert variant="destructive">
								<XCircleIcon className="size-4" />
								<AlertTitle>Import failed</AlertTitle>
								<AlertDescription>{state.message}</AlertDescription>
							</Alert>
							<Button variant="secondary" onClick={handleReset} className="w-full">
								Try again
							</Button>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Import History Card */}
			<ImportHistory />
		</div>
	);
}

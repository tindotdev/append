/**
 * Import page with state machine: idle → uploading → preview → committing → done
 */

import { useState } from 'react';
import { type BucketMapping, type CommitResult, commitImport } from '../api/commit-import';
import { type PreviewResult, previewImport } from '../api/preview-import';
import { FileUploader } from '../components/FileUploader';

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
		<div className="max-w-3xl">
			<h2 className="text-xl font-semibold">Import</h2>
			<p className="text-sm text-zinc-500 mt-1">Import terms from ENG-LOG markdown files.</p>

			{/* Idle / Upload state */}
			{(state.step === 'idle' || state.step === 'uploading') && (
				<div className="mt-6">
					<FileUploader onFilesUploaded={handleFilesUploaded} onError={handleUploadError} disabled={state.step === 'uploading'} />
				</div>
			)}

			{/* Loading preview */}
			{state.step === 'loading-preview' && (
				<div className="mt-6 p-4 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center gap-3">
					<span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
					<span className="text-zinc-400">Parsing uploaded files...</span>
				</div>
			)}

			{/* Preview state */}
			{state.step === 'preview' && (
				<div className="mt-6 space-y-6">
					{/* Stats summary */}
					<div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
						<h3 className="text-sm font-medium text-zinc-300 mb-3">Preview Summary</h3>
						<div className="grid grid-cols-2 gap-4 text-sm">
							<div>
								<span className="text-zinc-500">Total entries:</span> <span className="text-white">{state.preview.stats.totalEntries}</span>
							</div>
							<div>
								<span className="text-zinc-500">With definitions:</span>{' '}
								<span className="text-white">{state.preview.stats.entriesWithDefinition}</span>
							</div>
							<div>
								<span className="text-zinc-500">Inbox (skipped):</span> <span className="text-zinc-400">{state.preview.stats.inboxEntries}</span>
							</div>
							<div>
								<span className="text-zinc-500">New terms:</span> <span className="text-green-400">{state.preview.stats.newTerms}</span>
							</div>
							<div>
								<span className="text-zinc-500">Existing terms:</span> <span className="text-yellow-400">{state.preview.stats.existingTerms}</span>
							</div>
						</div>
					</div>

					{/* File-to-bucket mapping */}
					<div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800">
						<div className="p-4 bg-zinc-900/50">
							<h3 className="text-sm font-medium text-zinc-300">Map files to buckets</h3>
							<p className="text-xs text-zinc-500 mt-1">Select which bucket each file's terms should be imported into.</p>
						</div>
						{state.preview.parsedFiles.map((file) => (
							<div key={file.r2Key} className="p-4 flex items-center justify-between">
								<div className="flex-1">
									<p className="text-white font-medium">{file.filename}</p>
									<p className="text-zinc-500 text-sm">
										{file.entries.filter((e) => !e.isInbox).length} terms
										{file.warnings.length > 0 && <span className="text-yellow-500 ml-2">({file.warnings.length} warnings)</span>}
									</p>
								</div>
								<select
									value={state.bucketSelections[file.r2Key] || ''}
									onChange={(e) => handleBucketChange(file.r2Key, e.target.value)}
									className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
								>
									<option value="">Select bucket...</option>
									{state.preview.existingBuckets.map((bucket) => (
										<option key={bucket.id} value={bucket.id}>
											{bucket.name}
										</option>
									))}
								</select>
							</div>
						))}
					</div>

					{/* Action buttons */}
					<div className="flex gap-3">
						<button
							type="button"
							onClick={handleCommit}
							disabled={Object.values(state.bucketSelections).filter((id) => id !== '').length === 0}
							className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
						>
							Import {state.preview.stats.entriesWithDefinition} terms
						</button>
						<button
							type="button"
							onClick={handleReset}
							className="px-4 py-3 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
						>
							Cancel
						</button>
					</div>
				</div>
			)}

			{/* Committing state */}
			{state.step === 'committing' && (
				<div className="mt-6 p-4 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center gap-3">
					<span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
					<span className="text-zinc-400">Importing terms...</span>
				</div>
			)}

			{/* Done state */}
			{state.step === 'done' && (
				<div className="mt-6 space-y-4">
					<div className="p-4 bg-green-900/30 border border-green-800 rounded-lg">
						<h3 className="text-green-400 font-medium">Import complete</h3>
						<div className="mt-2 text-sm space-y-1">
							<p className="text-zinc-300">Created {state.result.stats.termCreatedCount} new terms</p>
							<p className="text-zinc-300">Added {state.result.stats.termSenseCreatedCount} senses</p>
							{state.result.stats.flaggedCount > 0 && (
								<p className="text-yellow-400">{state.result.stats.flaggedCount} entries flagged for bucket conflict</p>
							)}
							{state.result.stats.skippedCount > 0 && <p className="text-zinc-500">{state.result.stats.skippedCount} duplicates skipped</p>}
						</div>
					</div>
					<button
						type="button"
						onClick={handleReset}
						className="w-full px-4 py-3 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
					>
						Import more files
					</button>
				</div>
			)}

			{/* Error state */}
			{state.step === 'error' && (
				<div className="mt-6 space-y-4">
					<div className="p-4 bg-red-900/30 border border-red-800 rounded-lg">
						<h3 className="text-red-400 font-medium">Import failed</h3>
						<p className="mt-1 text-sm text-zinc-300">{state.message}</p>
					</div>
					<button
						type="button"
						onClick={handleReset}
						className="w-full px-4 py-3 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
					>
						Try again
					</button>
				</div>
			)}
		</div>
	);
}

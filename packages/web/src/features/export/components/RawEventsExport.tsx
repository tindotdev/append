import { Download } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Field, FieldDescription } from '@/components/ui/field';
import { downloadEventsExport, type EventsExportResult } from '../api/download-events-export';

interface ExportState {
	isDownloading: boolean;
	result: EventsExportResult | null;
	cursor: string | null;
	chunkNumber: number; // 1-based; 0 means no download started yet
}

const initialState: ExportState = {
	isDownloading: false,
	result: null,
	cursor: null,
	chunkNumber: 0,
};

function formatDateForApi(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function getDefaultDateRange(): { from: Date; to: Date } {
	const today = new Date();
	const sevenDaysAgo = new Date(today);
	sevenDaysAgo.setDate(today.getDate() - 6);

	return {
		from: sevenDaysAgo,
		to: today,
	};
}

export function RawEventsExport() {
	const defaultRange = getDefaultDateRange();
	const [fromDate, setFromDate] = useState(defaultRange.from);
	const [toDate, setToDate] = useState(defaultRange.to);
	const [state, setState] = useState<ExportState>(initialState);

	const handleDownload = async (cursor?: string, existingChunkNumber?: number) => {
		// Determine the next chunk number
		const nextChunkNumber = existingChunkNumber !== undefined ? existingChunkNumber + 1 : 1;

		setState((prev) => ({
			...prev,
			isDownloading: true,
			result: null,
		}));

		const result = await downloadEventsExport({
			from: formatDateForApi(fromDate),
			to: formatDateForApi(toDate),
			cursor,
			// Only use part numbers when we expect multi-part exports (cursor continuation)
			// or when the first chunk gets truncated
			partNumber: cursor ? nextChunkNumber : undefined,
		});

		// If first download was truncated, we need to rename it mentally as part 1
		// The next download will be part 2, etc.
		const effectiveChunkNumber = result.success && result.truncated && !cursor ? 1 : nextChunkNumber;

		setState({
			isDownloading: false,
			result,
			cursor: result.success && result.truncated ? result.cursor : null,
			chunkNumber: result.success ? effectiveChunkNumber : state.chunkNumber,
		});
	};

	const handleRangeChange = (from: Date, to: Date) => {
		setFromDate(from);
		setToDate(to);
		handleReset();
	};

	const handleDownloadNext = () => {
		if (state.cursor) {
			handleDownload(state.cursor, state.chunkNumber);
		}
	};

	const handleReset = () => {
		setState(initialState);
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Raw Events (NDJSON)</CardTitle>
				<CardDescription>Export your raw telemetry events as newline-delimited JSON.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center justify-between gap-4">
					<Field className="flex-1">
						<DateRangePicker from={fromDate} to={toDate} onRangeChange={handleRangeChange} disabled={state.isDownloading} />
					</Field>

					<div className="flex gap-2">
						<Button
							size="sm"
							onClick={() => handleDownload()}
							disabled={state.isDownloading}
							title={state.isDownloading && !state.cursor ? 'Downloading...' : 'Download NDJSON'}
						>
							{state.isDownloading && !state.cursor ? (
								<span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
							) : (
								<Download className="size-4" />
							)}
						</Button>

						{state.cursor && (
							<Button size="sm" variant="secondary" onClick={handleDownloadNext} disabled={state.isDownloading}>
								{state.isDownloading ? (
									<>
										<span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
										Downloading...
									</>
								) : (
									<>
										<Download className="size-3.5" />
										Next Chunk
									</>
								)}
							</Button>
						)}
					</div>
				</div>

				{state.result &&
					(state.result.success ? (
						<Alert className={state.result.truncated ? 'border-warning' : 'border-success'}>
							<AlertTitle className={state.result.truncated ? 'text-warning' : 'text-success'}>
								{state.result.truncated
									? `Export truncated (part ${state.chunkNumber})`
									: state.chunkNumber > 1
										? `Download complete (${state.chunkNumber} parts total)`
										: 'Download complete'}
							</AlertTitle>
							<AlertDescription>
								<p>Downloaded: {state.result.filename}</p>
								{state.result.truncated && (
									<p className="mt-1">More data available. Click "Next Chunk" to download part {state.chunkNumber + 1}.</p>
								)}
							</AlertDescription>
						</Alert>
					) : (
						<Alert variant="destructive">
							<AlertTitle>Export failed</AlertTitle>
							<AlertDescription>{state.result.error}</AlertDescription>
						</Alert>
					))}

				<FieldDescription>
					Large exports may be truncated into multiple chunks. Continuation files are named with part numbers (e.g., .part-002.ndjson). If you
					stop mid-way, you can resume from where you left off by clicking "Next Chunk".
				</FieldDescription>
			</CardContent>
		</Card>
	);
}

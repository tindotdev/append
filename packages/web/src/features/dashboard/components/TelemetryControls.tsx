import { Download, Flame, Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { addActivity, addCapture, exportEventsNdjson, resetTelemetry } from '../telemetry/actions';
import { useTelemetrySnapshot } from '../telemetry/hooks';

const QUICK_SOURCES = [
	{ label: 'Cloudflare Workers docs', url: 'https://docs.cloudflare.com/workers/' },
	{ label: 'React docs', url: 'https://react.dev/learn' },
	{ label: 'Postgres docs', url: 'https://www.postgresql.org/docs/current/' },
	{ label: 'MDN Web API', url: 'https://developer.mozilla.org/en-US/docs/Web/API' },
] as const;

const CAPTURE_TEXT_ID = 'telemetry-capture-text';
const CAPTURE_NOTE_ID = 'telemetry-capture-note';
const MINUTES_ID = 'telemetry-minutes';

export function TelemetryControls() {
	const { events, timezone } = useTelemetrySnapshot();
	const [url, setUrl] = useState<string>(QUICK_SOURCES[0].url);
	const [minutes, setMinutes] = useState('15');

	const eventCount = events.length;

	const handleAddActivity = async () => {
		const parsedMinutes = Number(minutes);
		if (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0) {
			toast.error('Enter a valid number of minutes.');
			return;
		}

		const res = await addActivity({ url, minutes: parsedMinutes });
		if (!res.ok) {
			toast.error(res.error);
			return;
		}
		toast.success(`Added ~${Math.round(parsedMinutes)}m of activity.`);
	};

	const [captureType, setCaptureType] = useState<'term' | 'question'>('term');
	const [captureLabel, setCaptureLabel] = useState('');
	const [captureNote, setCaptureNote] = useState('');

	const handleAddCapture = async () => {
		if (!captureLabel.trim()) {
			toast.error('Capture text is required.');
			return;
		}
		await addCapture({
			url,
			capture_type: captureType,
			label: captureLabel.trim(),
			note: captureNote.trim() ? captureNote.trim() : undefined,
		});
		toast.success('Capture saved.');
		setCaptureLabel('');
		setCaptureNote('');
	};

	return (
		<Card className="mb-4">
			<CardHeader className="gap-1">
				<CardDescription className="text-xs">Telemetry (local simulator)</CardDescription>
				<CardTitle className="text-base">Drive the dashboard with real event-shaped data</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<div className="flex flex-col gap-2 @xl/main:flex-row @xl/main:items-end">
					<div className="flex-1">
						<div className="text-xs text-zinc-500">Source URL</div>
						<Select value={url} onValueChange={setUrl}>
							<SelectTrigger className="mt-1">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{QUICK_SOURCES.map((s) => (
									<SelectItem key={s.url} value={s.url}>
										{s.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="w-full @xl/main:w-36">
						<label className="text-xs text-zinc-500" htmlFor={MINUTES_ID}>
							Minutes
						</label>
						<Input id={MINUTES_ID} className="mt-1" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
					</div>
					<Button onClick={handleAddActivity} className="@xl/main:shrink-0">
						<Flame className="mr-2 size-4" />
						Add activity
					</Button>
				</div>

				<div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
					<span>
						Events: <span className="tabular-nums text-zinc-300">{eventCount}</span>
					</span>
					<span className="text-zinc-700">•</span>
					<span>
						Timezone: <span className="text-zinc-300">{timezone}</span>
					</span>
				</div>

				<div className="flex flex-wrap gap-2">
					<Dialog>
						<DialogTrigger asChild>
							<Button variant="outline">
								<Plus className="mr-2 size-4" />
								Add capture
							</Button>
						</DialogTrigger>
						<DialogContent className="max-w-md">
							<DialogHeader>
								<DialogTitle>New capture</DialogTitle>
								<DialogDescription>Creates a `capture` event tied to the selected URL.</DialogDescription>
							</DialogHeader>
							<div className="space-y-3">
								<div className="space-y-1">
									<div className="text-xs text-zinc-500">Type</div>
									<Select value={captureType} onValueChange={(v) => setCaptureType(v as 'term' | 'question')}>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="term">term</SelectItem>
											<SelectItem value="question">question</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1">
									<label className="text-xs text-zinc-500" htmlFor={CAPTURE_TEXT_ID}>
										Text
									</label>
									<Input
										id={CAPTURE_TEXT_ID}
										value={captureLabel}
										onChange={(e) => setCaptureLabel(e.target.value)}
										placeholder="e.g. idempotency key"
									/>
								</div>
								<div className="space-y-1">
									<label className="text-xs text-zinc-500" htmlFor={CAPTURE_NOTE_ID}>
										Note (optional)
									</label>
									<Textarea
										id={CAPTURE_NOTE_ID}
										value={captureNote}
										onChange={(e) => setCaptureNote(e.target.value)}
										rows={3}
										placeholder="Short context to help future-you"
									/>
								</div>
								<div className="flex justify-end gap-2">
									<Button variant="outline" onClick={() => setCaptureLabel('')}>
										Clear
									</Button>
									<Button onClick={handleAddCapture}>Save capture</Button>
								</div>
							</div>
						</DialogContent>
					</Dialog>

					<Button variant="outline" onClick={() => exportEventsNdjson()}>
						<Download className="mr-2 size-4" />
						Export events (ndjson)
					</Button>

					<Button
						variant="outline"
						onClick={() => {
							if (!window.confirm('Reset local telemetry events?')) return;
							resetTelemetry();
							toast.success('Telemetry reset.');
						}}
					>
						<RotateCcw className="mr-2 size-4" />
						Reset
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

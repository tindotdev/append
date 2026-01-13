import { Download, Flame, FlaskConical, Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { setUseApi, useApiToggle } from '../api/dashboard';
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

const DEV_MODE = import.meta.env.DEV;

export function TelemetryControls() {
	const { events, timezone } = useTelemetrySnapshot();
	const [url, setUrl] = useState<string>(QUICK_SOURCES[0].url);
	const [minutes, setMinutes] = useState('15');
	const useApi = useApiToggle();

	const eventCount = events.length;

	const handleApiToggle = (checked: boolean) => {
		setUseApi(checked);
		toast.success(checked ? 'Switched to API mode' : 'Switched to local simulator');
	};

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

	// Hide entire component in production - simulator is dev-only
	if (!DEV_MODE) return null;

	return (
		<Sheet>
			<SheetTrigger asChild>
				<Button
					variant="outline"
					size="icon"
					className="fixed bottom-4 right-4 z-40 size-9 rounded-full border-zinc-800 bg-zinc-950/80 shadow-sm backdrop-blur-sm hover:bg-zinc-900"
					title="Open telemetry controls (dev only)"
				>
					<FlaskConical className="size-4" />
				</Button>
			</SheetTrigger>
			<SheetContent className="w-full overflow-y-auto sm:max-w-md">
				<SheetHeader>
					<SheetTitle>Telemetry Controls (Dev Only)</SheetTitle>
					<SheetDescription>Local simulator for driving the dashboard with event data. Production uses the API.</SheetDescription>
				</SheetHeader>

				<div className="mt-6 flex flex-col gap-6 px-4 pb-6">
					{/* Data Source Toggle (dev only) */}
					{DEV_MODE && (
						<div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
							<div className="flex flex-col">
								<Label htmlFor="api-toggle" className="text-sm font-medium">
									Use API
								</Label>
								<span className="text-xs text-zinc-500">{useApi ? 'Reading from server' : 'Using local simulator'}</span>
							</div>
							<Switch id="api-toggle" checked={useApi} onCheckedChange={handleApiToggle} />
						</div>
					)}

					{/* Stats */}
					<div className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400">
						<span>
							Events: <span className="tabular-nums text-zinc-300">{eventCount}</span>
						</span>
						<span className="text-zinc-700">•</span>
						<span>
							Timezone: <span className="text-zinc-300">{timezone}</span>
						</span>
					</div>

					{!useApi && (
						<>
							{/* Add Activity Section */}
							<div className="space-y-3">
								<h3 className="text-sm font-medium">Add Activity</h3>
								<div className="space-y-3">
									<div>
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
									<div>
										<label className="text-xs text-zinc-500" htmlFor={MINUTES_ID}>
											Minutes
										</label>
										<Input id={MINUTES_ID} className="mt-1" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
									</div>
									<Button onClick={handleAddActivity} className="w-full">
										<Flame className="mr-2 size-4" />
										Add activity
									</Button>
								</div>
							</div>

							{/* Add Capture Section */}
							<div className="space-y-3">
								<h3 className="text-sm font-medium">Add Capture</h3>
								<div className="space-y-3">
									<div>
										<div className="text-xs text-zinc-500">Type</div>
										<Select value={captureType} onValueChange={(v) => setCaptureType(v as 'term' | 'question')}>
											<SelectTrigger className="mt-1">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="term">term</SelectItem>
												<SelectItem value="question">question</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div>
										<label className="text-xs text-zinc-500" htmlFor={CAPTURE_TEXT_ID}>
											Text
										</label>
										<Input
											id={CAPTURE_TEXT_ID}
											className="mt-1"
											value={captureLabel}
											onChange={(e) => setCaptureLabel(e.target.value)}
											placeholder="e.g. idempotency key"
										/>
									</div>
									<div>
										<label className="text-xs text-zinc-500" htmlFor={CAPTURE_NOTE_ID}>
											Note (optional)
										</label>
										<Textarea
											id={CAPTURE_NOTE_ID}
											className="mt-1"
											value={captureNote}
											onChange={(e) => setCaptureNote(e.target.value)}
											rows={3}
											placeholder="Short context to help future-you"
										/>
									</div>
									<div className="flex gap-2">
										<Button variant="outline" onClick={() => setCaptureLabel('')} className="flex-1">
											Clear
										</Button>
										<Button onClick={handleAddCapture} className="flex-1">
											<Plus className="mr-2 size-4" />
											Save
										</Button>
									</div>
								</div>
							</div>

							{/* Actions Section */}
							<div className="space-y-3 border-t border-zinc-800 pt-6">
								<h3 className="text-sm font-medium">Actions</h3>
								<div className="flex flex-col gap-2">
									<Button variant="outline" onClick={() => exportEventsNdjson()} className="w-full justify-start">
										<Download className="mr-2 size-4" />
										Export simulated events (ndjson)
									</Button>
									<Button
										variant="outline"
										onClick={() => {
											if (!window.confirm('Reset local telemetry events?')) return;
											resetTelemetry();
											toast.success('Telemetry reset.');
										}}
										className="w-full justify-start"
									>
										<RotateCcw className="mr-2 size-4" />
										Reset telemetry
									</Button>
								</div>
							</div>
						</>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}

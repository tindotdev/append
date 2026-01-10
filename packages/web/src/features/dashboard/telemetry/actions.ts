import { appendEvents, clearEvents, ensureTelemetryReady, getEvents, getOrCreateDeviceId, getTimezone } from './storage';
import type { TelemetryEvent } from './types';
import { isHttpUrl, urlToArtifact } from './url';

const HEARTBEAT_INTERVAL_MS = 30_000;

export async function addActivity(opts: { url: string; minutes: number }) {
	await ensureTelemetryReady();
	if (!isHttpUrl(opts.url)) return { ok: false as const, error: 'Only http/https URLs are supported for heartbeats.' };

	const device_id = getOrCreateDeviceId();
	const artifact = await urlToArtifact(opts.url);

	const now = Date.now();
	const durationMs = Math.max(1, Math.round(opts.minutes)) * 60_000;
	const count = Math.max(1, Math.floor(durationMs / HEARTBEAT_INTERVAL_MS));

	const events: TelemetryEvent[] = [];
	for (let i = 0; i < count; i += 1) {
		const emitted_at = now - (count - 1 - i) * HEARTBEAT_INTERVAL_MS;
		events.push({
			schema_version: 1,
			event_id: crypto.randomUUID(),
			device_id,
			emitted_at,
			received_at: emitted_at,
			type: 'artifact_active',
			artifact,
			payload: {
				interval_ms: HEARTBEAT_INTERVAL_MS,
				active_signals: { window_focused: true, tab_active: true, user_idle: false },
			},
		});
	}

	appendEvents(events);
	return { ok: true as const };
}

export async function addCapture(opts: { url?: string; capture_type: 'term' | 'question'; label: string; note?: string }) {
	await ensureTelemetryReady();
	const device_id = getOrCreateDeviceId();

	const artifact = opts.url && isHttpUrl(opts.url) ? await urlToArtifact(opts.url) : undefined;
	const emitted_at = Date.now();

	const event: TelemetryEvent = {
		schema_version: 1,
		event_id: crypto.randomUUID(),
		device_id,
		emitted_at,
		received_at: emitted_at,
		type: 'capture',
		artifact,
		payload: {
			capture_type: opts.capture_type,
			label: opts.label,
			note: opts.note,
		},
	};

	appendEvents([event]);
	return { ok: true as const };
}

export function resetTelemetry() {
	clearEvents();
}

export async function exportEventsNdjson() {
	await ensureTelemetryReady();
	const timezone = getTimezone();
	const events = getEvents();
	const body = `${events.map((e) => JSON.stringify({ ...e, timezone })).join('\n')}\n`;
	const blob = new Blob([body], { type: 'application/x-ndjson' });

	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = `append-events-${new Date().toISOString().slice(0, 10)}.ndjson`;
	a.click();
	URL.revokeObjectURL(a.href);
}

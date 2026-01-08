import { getSettings } from './settings';
import type { IngestResponse, TelemetryEvent } from './types';

const OUTBOX_KEY = 'append_outbox_v1';
const DEADLETTER_KEY = 'append_outbox_deadletter_v1';

const MAX_OUTBOX_EVENTS = 5000;
const BATCH_SIZE = 200;

type DeadletterItem = {
	at_ms: number;
	reason: string;
	event: TelemetryEvent;
};

async function getOutbox(): Promise<TelemetryEvent[]> {
	const raw = await chrome.storage.local.get(OUTBOX_KEY);
	const list = raw[OUTBOX_KEY];
	return Array.isArray(list) ? (list as TelemetryEvent[]) : [];
}

async function setOutbox(events: TelemetryEvent[]): Promise<void> {
	await chrome.storage.local.set({ [OUTBOX_KEY]: events });
}

async function appendDeadletter(items: DeadletterItem[]): Promise<void> {
	const raw = await chrome.storage.local.get(DEADLETTER_KEY);
	const existing = Array.isArray(raw[DEADLETTER_KEY]) ? (raw[DEADLETTER_KEY] as DeadletterItem[]) : [];
	await chrome.storage.local.set({ [DEADLETTER_KEY]: existing.concat(items).slice(-500) });
}

export async function enqueueEvent(event: TelemetryEvent): Promise<void> {
	const outbox = await getOutbox();
	outbox.push(event);
	const trimmed = outbox.length > MAX_OUTBOX_EVENTS ? outbox.slice(-MAX_OUTBOX_EVENTS) : outbox;
	await setOutbox(trimmed);
}

export async function flushOutbox(): Promise<void> {
	const settings = await getSettings();
	if (!settings.deviceToken) return;

	const outbox = await getOutbox();
	if (outbox.length === 0) return;

	const batch = outbox.slice(0, BATCH_SIZE);
	const url = `${settings.apiBaseUrl}/events/ingest`;

	let res: Response;
	try {
		res = await fetch(url, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${settings.deviceToken}`,
			},
			body: JSON.stringify({ events: batch }),
		});
	} catch (err) {
		console.warn('[append][outbox] upload failed', err);
		return;
	}

	if (res.status === 401) {
		console.warn('[append][outbox] unauthorized (check token)');
		return;
	}

	let body: IngestResponse;
	try {
		body = (await res.json()) as IngestResponse;
	} catch (err) {
		console.warn('[append][outbox] invalid response', err);
		return;
	}

	if (!res.ok) {
		console.warn('[append][outbox] server error', { status: res.status, body });
		return;
	}

	if (!('rejected' in body) || !Array.isArray(body.rejected)) {
		console.warn('[append][outbox] unexpected response', body);
		return;
	}

	const rejectedByIndex = new Map<number, string>();
	for (const r of body.rejected) {
		if (typeof r.index === 'number' && typeof r.reason === 'string') {
			rejectedByIndex.set(r.index, r.reason);
		}
	}

	const remaining: TelemetryEvent[] = [];
	const deadletter: DeadletterItem[] = [];

	// Remove submitted events from the front; keep rejected items in deadletter.
	for (let i = 0; i < outbox.length; i += 1) {
		if (i < batch.length) {
			const reason = rejectedByIndex.get(i);
			if (reason) {
				deadletter.push({ at_ms: Date.now(), reason, event: outbox[i] });
			}
			continue;
		}
		remaining.push(outbox[i]);
	}

	await setOutbox(remaining);
	if (deadletter.length > 0) {
		await appendDeadletter(deadletter);
		console.warn(
			'[append][outbox] dropped rejected events',
			deadletter.map((d) => ({ event_id: d.event.event_id, reason: d.reason }))
		);
	}
}

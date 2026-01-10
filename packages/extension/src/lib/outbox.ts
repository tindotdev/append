import { getSettings } from './settings';
import type { IngestResponse, TelemetryEvent } from './types';

const OUTBOX_KEY = 'append_outbox_v1';
const DEADLETTER_KEY = 'append_outbox_deadletter_v1';
const BACKOFF_KEY = 'append_outbox_backoff_v1';
const AUTH_ERROR_KEY = 'append_outbox_auth_error_v1';

const MAX_OUTBOX_EVENTS = 5000;
const BATCH_SIZE = 200;
const OUTBOX_WARNING_THRESHOLD = 1000;

const BACKOFF_INITIAL_MS = 60_000; // 1 minute
const BACKOFF_MAX_MS = 15 * 60_000; // 15 minutes
const BACKOFF_MULTIPLIER = 2;

type BackoffState = {
	consecutiveFailures: number;
	nextRetryAt: number;
};

type AuthErrorState = {
	hasAuthError: boolean;
	lastAuthErrorAt: number;
};

export type DeadletterItem = {
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

export async function getDeadletterItems(): Promise<DeadletterItem[]> {
	const raw = await chrome.storage.local.get(DEADLETTER_KEY);
	return Array.isArray(raw[DEADLETTER_KEY]) ? (raw[DEADLETTER_KEY] as DeadletterItem[]) : [];
}

export async function clearDeadletter(): Promise<void> {
	await chrome.storage.local.remove(DEADLETTER_KEY);
}

async function getBackoffState(): Promise<BackoffState> {
	const raw = await chrome.storage.local.get(BACKOFF_KEY);
	const state = raw[BACKOFF_KEY];
	if (state && typeof state === 'object' && 'consecutiveFailures' in state && 'nextRetryAt' in state) {
		return state as BackoffState;
	}
	return { consecutiveFailures: 0, nextRetryAt: 0 };
}

async function setBackoffState(state: BackoffState): Promise<void> {
	await chrome.storage.local.set({ [BACKOFF_KEY]: state });
}

async function getAuthErrorState(): Promise<AuthErrorState> {
	const raw = await chrome.storage.local.get(AUTH_ERROR_KEY);
	const state = raw[AUTH_ERROR_KEY];
	if (state && typeof state === 'object' && 'hasAuthError' in state && 'lastAuthErrorAt' in state) {
		return state as AuthErrorState;
	}
	return { hasAuthError: false, lastAuthErrorAt: 0 };
}

async function setAuthErrorState(state: AuthErrorState): Promise<void> {
	await chrome.storage.local.set({ [AUTH_ERROR_KEY]: state });
}

function calculateBackoffMs(consecutiveFailures: number): number {
	const backoffMs = BACKOFF_INITIAL_MS * BACKOFF_MULTIPLIER ** (consecutiveFailures - 1);
	return Math.min(backoffMs, BACKOFF_MAX_MS);
}

async function updateBadge(outboxCount: number, hasAuthError = false): Promise<void> {
	// Auth error takes precedence - show critical error state
	if (hasAuthError) {
		await chrome.action.setBadgeText({ text: '!' });
		await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
		await chrome.action.setTitle({ title: 'Append: Authentication error - please check your device token' });
		return;
	}

	await chrome.action.setTitle({ title: 'Append' });

	if (outboxCount === 0) {
		await chrome.action.setBadgeText({ text: '' });
		await chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
		return;
	}

	if (outboxCount >= OUTBOX_WARNING_THRESHOLD) {
		await chrome.action.setBadgeText({ text: `${Math.floor(outboxCount / 1000)}k` });
		await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
		console.warn(`[append][outbox] WARNING: ${outboxCount} events queued (threshold: ${OUTBOX_WARNING_THRESHOLD})`);
	} else if (outboxCount >= 100) {
		await chrome.action.setBadgeText({ text: `${Math.floor(outboxCount / 100)}00` });
		await chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
	} else {
		await chrome.action.setBadgeText({ text: String(outboxCount) });
		await chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
	}
}

export async function enqueueEvent(event: TelemetryEvent): Promise<void> {
	const outbox = await getOutbox();
	outbox.push(event);

	if (outbox.length > MAX_OUTBOX_EVENTS) {
		const overflowCount = outbox.length - MAX_OUTBOX_EVENTS;
		const dropped = outbox.slice(0, overflowCount);
		const trimmed = outbox.slice(overflowCount);

		await appendDeadletter(
			dropped.map((e) => ({
				at_ms: Date.now(),
				reason: 'outbox_overflow',
				event: e,
			}))
		);
		console.warn(`[append][outbox] overflow: ${overflowCount} oldest event(s) moved to deadletter (max: ${MAX_OUTBOX_EVENTS})`);

		await setOutbox(trimmed);
		const authErrorState = await getAuthErrorState();
		await updateBadge(trimmed.length, authErrorState.hasAuthError);
	} else {
		await setOutbox(outbox);
		const authErrorState = await getAuthErrorState();
		await updateBadge(outbox.length, authErrorState.hasAuthError);
	}
}

export async function getOutboxCount(): Promise<number> {
	const outbox = await getOutbox();
	return outbox.length;
}

export async function clearAuthError(): Promise<void> {
	await setAuthErrorState({ hasAuthError: false, lastAuthErrorAt: 0 });
	const outbox = await getOutbox();
	await updateBadge(outbox.length, false);
	console.log('[append][outbox] auth error cleared');
}

export async function flushOutbox(): Promise<void> {
	const settings = await getSettings();
	if (!settings.deviceToken) return;

	const outbox = await getOutbox();
	if (outbox.length === 0) return;

	// Check if we have an auth error - if so, stop flushing until user fixes token
	const authErrorState = await getAuthErrorState();
	if (authErrorState.hasAuthError) {
		console.warn('[append][outbox] auth error detected, skipping flush until token is updated');
		await updateBadge(outbox.length, true);
		return;
	}

	// Check if we're in backoff period
	const backoffState = await getBackoffState();
	const now = Date.now();
	if (backoffState.nextRetryAt > now) {
		const waitMs = backoffState.nextRetryAt - now;
		console.log(`[append][outbox] in backoff period, skipping flush (retry in ${Math.round(waitMs / 1000)}s)`);
		return;
	}

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
		// Network error - apply backoff
		const failures = backoffState.consecutiveFailures + 1;
		const backoffMs = calculateBackoffMs(failures);
		await setBackoffState({
			consecutiveFailures: failures,
			nextRetryAt: now + backoffMs,
		});
		console.warn(`[append][outbox] backoff applied: ${failures} failures, next retry in ${Math.round(backoffMs / 1000)}s`);
		return;
	}

	if (res.status === 401) {
		// Treat 401 as terminal auth error - stop flushing until user updates token
		await setAuthErrorState({ hasAuthError: true, lastAuthErrorAt: now });
		await updateBadge(outbox.length, true);
		console.error(
			'[append][outbox] UNAUTHORIZED: Authentication failed. ' +
				'Please check your device token. Outbox flushing paused until token is updated.'
		);
		return;
	}

	let body: IngestResponse;
	try {
		body = (await res.json()) as IngestResponse;
	} catch (err) {
		// Invalid JSON (e.g., HTML error page) - apply backoff
		const failures = backoffState.consecutiveFailures + 1;
		const backoffMs = calculateBackoffMs(failures);
		await setBackoffState({
			consecutiveFailures: failures,
			nextRetryAt: Date.now() + backoffMs,
		});
		console.warn('[append][outbox] invalid response, backoff applied', {
			error: err,
			failures,
			nextRetryInSec: Math.round(backoffMs / 1000),
		});
		return;
	}

	if (!res.ok) {
		// Server error (429, 500, etc.) - apply backoff to avoid hot-loop retries
		const failures = backoffState.consecutiveFailures + 1;
		const backoffMs = calculateBackoffMs(failures);
		await setBackoffState({
			consecutiveFailures: failures,
			nextRetryAt: Date.now() + backoffMs,
		});
		console.warn('[append][outbox] server error, backoff applied', {
			status: res.status,
			body,
			failures,
			nextRetryInSec: Math.round(backoffMs / 1000),
		});
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

	// Success - reset backoff state and clear any auth errors
	await setBackoffState({ consecutiveFailures: 0, nextRetryAt: 0 });
	await setAuthErrorState({ hasAuthError: false, lastAuthErrorAt: 0 });
	await updateBadge(remaining.length, false);

	if (deadletter.length > 0) {
		await appendDeadletter(deadletter);
		console.warn(
			'[append][outbox] dropped rejected events',
			deadletter.map((d) => ({ event_id: d.event.event_id, reason: d.reason }))
		);
	}
}

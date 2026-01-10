import { ensureDeviceId } from './lib/device';
import { enqueueEvent, flushOutbox } from './lib/outbox';
import { computeUrlHash, normalizeUrlForHash } from './lib/url';

const HEARTBEAT_ALARM_NAME = 'append_heartbeat';

/**
 * Heartbeat interval configuration.
 *
 * IMPORTANT: Chrome alarms have a minimum interval of ~30 seconds and may drift
 * slightly due to system load and browser optimization. This is acceptable because:
 * - Server-side sessionization handles gaps gracefully
 * - Events include client timestamps for accurate timing
 * - Drift is typically <1-2 seconds per interval
 *
 * The idle detection uses 60s (chrome.idle.queryState) which is intentionally
 * 2x the heartbeat interval to avoid false positives from brief inactivity.
 */
const HEARTBEAT_INTERVAL_MINUTES = 0.5;
const HEARTBEAT_INTERVAL_MS = 30_000;

chrome.runtime.onInstalled.addListener(async () => {
	await ensureDeviceId();
	chrome.alarms.create(HEARTBEAT_ALARM_NAME, { periodInMinutes: HEARTBEAT_INTERVAL_MINUTES });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name !== HEARTBEAT_ALARM_NAME) return;

	const deviceId = await ensureDeviceId();

	const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
	const idleState = await chrome.idle.queryState(60);
	const isIdle = idleState !== 'active';

	if (!activeTab?.url) return;

	const url = new URL(activeTab.url);
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

	let windowFocused = true;
	try {
		const win = await chrome.windows.get(activeTab.windowId);
		windowFocused = win.focused ?? true;
	} catch {
		// ignore
	}

	const tabActive = activeTab.active ?? true;
	const now = Date.now();
	const normalizedUrl = normalizeUrlForHash(url);

	const event = {
		schema_version: 1 as const,
		event_id: crypto.randomUUID(),
		device_id: deviceId,
		emitted_at: now,
		type: 'artifact_active' as const,
		artifact: {
			url_hash: await computeUrlHash(normalizedUrl),
			host: normalizedUrl.host,
			path_hint: normalizedUrl.pathname,
			title_hint: activeTab.title ?? undefined,
		},
		payload: {
			interval_ms: HEARTBEAT_INTERVAL_MS,
			active_signals: {
				window_focused: windowFocused,
				tab_active: tabActive,
				user_idle: isIdle,
			},
		},
	};

	await enqueueEvent(event);
	await flushOutbox();
	console.log('[append][heartbeat]', { host: normalizedUrl.host, path: normalizedUrl.pathname, windowFocused, tabActive, userIdle: isIdle });
});

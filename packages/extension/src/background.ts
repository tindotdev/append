import { ensureDeviceId } from './lib/device';
import { enqueueEvent, flushOutbox } from './lib/outbox';
import { computeUrlHash, normalizeUrlForHash } from './lib/url';

const HEARTBEAT_ALARM_NAME = 'append_heartbeat';
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

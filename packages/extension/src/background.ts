import { ensureDeviceId } from './lib/device';

const HEARTBEAT_ALARM_NAME = 'append_heartbeat';
const HEARTBEAT_INTERVAL_MINUTES = 0.5;

chrome.runtime.onInstalled.addListener(async () => {
	await ensureDeviceId();
	chrome.alarms.create(HEARTBEAT_ALARM_NAME, { periodInMinutes: HEARTBEAT_INTERVAL_MINUTES });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name !== HEARTBEAT_ALARM_NAME) return;

	await ensureDeviceId();

	const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
	const idleState = await chrome.idle.queryState(60);
	const isIdle = idleState !== 'active';

	if (!activeTab?.url) return;

	const url = new URL(activeTab.url);
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

	console.log('[append][heartbeat]', {
		tabId: activeTab.id,
		host: url.host,
		path: url.pathname,
		windowFocused: activeTab.active ?? true,
		userIdle: isIdle,
	});
});

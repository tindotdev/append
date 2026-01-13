import { generateSampleEvents } from './sample';
import { getBrowserTimezone } from './time';
import type { TelemetryEvent } from './types';

const EVENTS_KEY = 'append.telemetry.events.v1';
const DEVICE_ID_KEY = 'append.telemetry.device_id.v1';
const TIMEZONE_KEY = 'append.telemetry.timezone.v1';

type Listener = () => void;

let listeners: Set<Listener> | null = null;
let cachedEvents: TelemetryEvent[] = [];
let revision = 0;

let initState: 'uninitialized' | 'initializing' | 'ready' = 'uninitialized';
let initPromise: Promise<void> | null = null;

function canUseStorage() {
	return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function notify() {
	revision += 1;
	for (const l of listeners ?? []) l();
}

function loadEventsFromStorage() {
	if (!canUseStorage()) return;
	const raw = window.localStorage.getItem(EVENTS_KEY);
	if (!raw) {
		cachedEvents = [];
		return;
	}
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) {
			cachedEvents = [];
			return;
		}
		cachedEvents = parsed as TelemetryEvent[];
	} catch {
		cachedEvents = [];
	}
}

function saveEventsToStorage() {
	if (!canUseStorage()) return;
	window.localStorage.setItem(EVENTS_KEY, JSON.stringify(cachedEvents));
}

export function getTimezone(): string {
	if (!canUseStorage()) return getBrowserTimezone();
	return window.localStorage.getItem(TIMEZONE_KEY) ?? getBrowserTimezone();
}

export function setTimezone(timezone: string) {
	if (!canUseStorage()) return;
	window.localStorage.setItem(TIMEZONE_KEY, timezone);
	notify();
}

export function getOrCreateDeviceId(): string {
	if (!canUseStorage()) return crypto.randomUUID();
	const existing = window.localStorage.getItem(DEVICE_ID_KEY);
	if (existing) return existing;
	const next = crypto.randomUUID();
	window.localStorage.setItem(DEVICE_ID_KEY, next);
	return next;
}

export function getEvents(): TelemetryEvent[] {
	return cachedEvents;
}

export function appendEvents(events: TelemetryEvent[]) {
	cachedEvents = [...cachedEvents, ...events];
	saveEventsToStorage();
	notify();
}

export function clearEvents() {
	cachedEvents = [];
	if (canUseStorage()) window.localStorage.removeItem(EVENTS_KEY);
	notify();
}

export function subscribe(listener: Listener) {
	if (!listeners) listeners = new Set();
	listeners.add(listener);
	return () => listeners?.delete(listener);
}

export function getRevision() {
	return revision;
}

export function isTelemetryReady() {
	return initState === 'ready';
}

export function ensureTelemetryReady(): Promise<void> {
	if (initState === 'ready') return Promise.resolve();
	if (initPromise) return initPromise;

	initState = 'initializing';
	initPromise = (async () => {
		loadEventsFromStorage();
		if (cachedEvents.length === 0) {
			const device_id = getOrCreateDeviceId();
			const timezone = getTimezone();
			const sample = await generateSampleEvents({ device_id, timezone });
			cachedEvents = sample;
			saveEventsToStorage();
		}
		initState = 'ready';
		notify();
	})();

	return initPromise;
}

export async function regenerateSampleEvents(): Promise<void> {
	await ensureTelemetryReady();
	const device_id = getOrCreateDeviceId();
	const timezone = getTimezone();
	const sample = await generateSampleEvents({ device_id, timezone });
	cachedEvents = sample;
	saveEventsToStorage();
	notify();
}

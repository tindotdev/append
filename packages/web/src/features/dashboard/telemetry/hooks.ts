import { useEffect, useSyncExternalStore } from 'react';
import { ensureTelemetryReady, getEvents, getRevision, getTimezone, isTelemetryReady, subscribe } from './storage';

export function useTelemetryReady() {
	const revision = useSyncExternalStore(subscribe, getRevision, getRevision);

	useEffect(() => {
		void ensureTelemetryReady();
	}, []);

	return { isReady: isTelemetryReady(), revision };
}

export function useTelemetrySnapshot() {
	const { isReady, revision } = useTelemetryReady();

	return {
		isReady,
		revision,
		events: getEvents(),
		timezone: getTimezone(),
	};
}

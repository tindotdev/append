export type TopicSlug = 'foundations' | 'backend' | 'frontend' | 'dx-tooling' | 'deep-concepts';

export type TelemetryEventType = 'artifact_active' | 'capture' | 'topic_override' | 'aha_candidate';

export interface Artifact {
	url_hash: string;
	host: string;
	path_hint?: string;
	title_hint?: string;
}

export interface TelemetryEventBase {
	schema_version: 1;
	event_id: string;
	device_id: string;
	emitted_at: number;
	received_at: number;
	type: TelemetryEventType;
	artifact?: Artifact;
}

export interface ArtifactActiveEvent extends TelemetryEventBase {
	type: 'artifact_active';
	artifact: Artifact;
	payload: {
		interval_ms: number;
		active_signals: {
			window_focused: boolean;
			tab_active: boolean;
			user_idle: boolean;
		};
	};
}

export interface CaptureEvent extends TelemetryEventBase {
	type: 'capture';
	artifact?: Artifact;
	payload: {
		capture_type: 'term' | 'question';
		label: string;
		note?: string;
	};
}

export interface TopicOverrideEvent extends TelemetryEventBase {
	type: 'topic_override';
	artifact?: Artifact;
	payload: {
		topic_slug: TopicSlug;
		scope: 'artifact' | 'capture' | 'time_range';
		starts_at?: number;
		ends_at?: number;
	};
}

export interface AhaCandidateEvent extends TelemetryEventBase {
	type: 'aha_candidate';
	artifact?: Artifact;
	payload: {
		label: string;
		reason: 'manual' | 'heuristic' | 'ai';
	};
}

export type TelemetryEvent = ArtifactActiveEvent | CaptureEvent | TopicOverrideEvent | AhaCandidateEvent;

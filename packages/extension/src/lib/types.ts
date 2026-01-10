export type Artifact = {
	url_hash: string;
	host: string;
	path_hint?: string;
	title_hint?: string;
};

export type ActiveSignals = {
	window_focused: boolean;
	tab_active: boolean;
	user_idle: boolean;
};

export type ArtifactActiveEvent = {
	schema_version: 1;
	event_id: string;
	device_id: string;
	emitted_at: number;
	type: 'artifact_active';
	artifact: Artifact;
	payload: {
		interval_ms: number;
		active_signals: ActiveSignals;
	};
};

export type TelemetryEvent = ArtifactActiveEvent;

export type IngestResponse =
	| {
			accepted: number;
			inserted: number;
			rejected: Array<{ index: number; event_id?: string; reason: string }>;
			server_time_ms: number;
	  }
	| { error: { code: string; message: string } };

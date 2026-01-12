import * as v from 'valibot';

const UUID = (label: string) => v.pipe(v.string(), v.uuid(`${label} must be a valid UUID`));

export const ArtifactSchema = v.object({
	url_hash: v.pipe(v.string(), v.minLength(1, 'artifact.url_hash is required')),
	host: v.pipe(v.string(), v.minLength(1, 'artifact.host is required')),
	path_hint: v.optional(v.string()),
	title_hint: v.optional(v.string()),
});

const ActiveSignalsSchema = v.object({
	window_focused: v.boolean(),
	tab_active: v.boolean(),
	user_idle: v.boolean(),
});

const ArtifactActiveEventSchema = v.object({
	schema_version: v.literal(1),
	event_id: UUID('event_id'),
	device_id: UUID('device_id'),
	emitted_at: v.pipe(v.number(), v.minValue(0, 'emitted_at must be >= 0')),
	type: v.literal('artifact_active'),
	artifact: ArtifactSchema,
	payload: v.object({
		interval_ms: v.pipe(v.number(), v.minValue(1, 'payload.interval_ms must be >= 1')),
		active_signals: ActiveSignalsSchema,
	}),
});

const CaptureEventSchema = v.object({
	schema_version: v.literal(1),
	event_id: UUID('event_id'),
	device_id: UUID('device_id'),
	emitted_at: v.pipe(v.number(), v.minValue(0, 'emitted_at must be >= 0')),
	type: v.literal('capture'),
	artifact: v.optional(ArtifactSchema),
	payload: v.object({
		capture_type: v.picklist(['term', 'question'], 'payload.capture_type must be "term" or "question"'),
		label: v.pipe(v.string(), v.minLength(1, 'payload.label is required')),
		note: v.optional(v.string()),
	}),
});

const TopicOverrideEventSchema = v.object({
	schema_version: v.literal(1),
	event_id: UUID('event_id'),
	device_id: UUID('device_id'),
	emitted_at: v.pipe(v.number(), v.minValue(0, 'emitted_at must be >= 0')),
	type: v.literal('topic_override'),
	artifact: v.optional(ArtifactSchema),
	payload: v.object({
		topic_slug: v.picklist(['foundations', 'backend', 'frontend', 'dx-tooling', 'deep-concepts'], 'payload.topic_slug is invalid'),
		scope: v.picklist(['artifact', 'capture', 'time_range'], 'payload.scope is invalid'),
		starts_at: v.optional(v.number()),
		ends_at: v.optional(v.number()),
	}),
});

const AhaCandidateEventSchema = v.object({
	schema_version: v.literal(1),
	event_id: UUID('event_id'),
	device_id: UUID('device_id'),
	emitted_at: v.pipe(v.number(), v.minValue(0, 'emitted_at must be >= 0')),
	type: v.literal('aha_candidate'),
	artifact: v.optional(ArtifactSchema),
	payload: v.object({
		label: v.pipe(v.string(), v.minLength(1, 'payload.label is required')),
		reason: v.picklist(['manual', 'heuristic', 'ai'], 'payload.reason is invalid'),
	}),
});

export const TelemetryEventSchema = v.variant('type', [
	ArtifactActiveEventSchema,
	CaptureEventSchema,
	TopicOverrideEventSchema,
	AhaCandidateEventSchema,
]);

export type TelemetryEventInput = v.InferOutput<typeof TelemetryEventSchema>;

export const IngestEventsRequestSchema = v.object({
	client_batch_id: v.optional(UUID('client_batch_id')),
	events: v.pipe(v.array(v.unknown()), v.minLength(1, 'events must not be empty'), v.maxLength(500, 'events must be <= 500')),
});

export type IngestEventsRequestInput = v.InferOutput<typeof IngestEventsRequestSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Export endpoint validation
// ─────────────────────────────────────────────────────────────────────────────

const DayKeyRegex = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate that a day key represents a real calendar date (not just format).
 * Rejects impossible dates like 2026-02-30 or 2026-13-01.
 */
function isValidDayKey(dayKey: string): boolean {
	if (!DayKeyRegex.test(dayKey)) return false;
	const [y, m, d] = dayKey.split('-').map((n) => Number(n));
	const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
	return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const DayKeySchema = v.pipe(
	v.string(),
	v.check((s) => isValidDayKey(s), 'Invalid date. Must be a valid calendar date in YYYY-MM-DD format.')
);

export const ExportEventsQuerySchema = v.object({
	from: DayKeySchema,
	to: DayKeySchema,
	format: v.literal('ndjson'),
});

export type ExportEventsQuery = v.InferOutput<typeof ExportEventsQuerySchema>;

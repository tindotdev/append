import type { TelemetryEvent, TopicSlug } from './types';
import { urlToArtifact } from './url';

const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_HEARTBEATS_PER_SESSION = 240;
const SAMPLE_DAYS = 21;

const SAMPLE_SOURCES: Array<{ url: string; topic: TopicSlug }> = [
	{ url: 'https://docs.cloudflare.com/workers/', topic: 'dx-tooling' },
	{ url: 'https://react.dev/learn', topic: 'frontend' },
	{ url: 'https://www.postgresql.org/docs/current/', topic: 'backend' },
	{ url: 'https://developer.mozilla.org/en-US/docs/Web/API', topic: 'frontend' },
	{ url: 'https://en.wikipedia.org/wiki/Idempotence', topic: 'foundations' },
	{ url: 'https://martinfowler.com/articles/patterns-of-distributed-systems/', topic: 'deep-concepts' },
];

function randInt(min: number, max: number) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(items: T[]): T {
	return items[Math.floor(Math.random() * items.length)];
}

function dateAtUtcNoonOffset(daysAgo: number) {
	const now = new Date();
	const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0);
	return base - daysAgo * 24 * 60 * 60 * 1000;
}

function shouldHaveActivityToday() {
	return Math.random() >= 0.4;
}

function shouldHaveActivityForDay(daysAgo: number) {
	// Demo/dev should almost always look "alive", especially for recent days.
	// Guarantee activity for today and yesterday to avoid empty dashboard states.
	if (daysAgo <= 1) return true;
	// Encourage a mostly-active recent week.
	if (daysAgo <= 6) return Math.random() >= 0.25;
	return shouldHaveActivityToday();
}

function sessionCountForDay(daysAgo: number) {
	// Keep today a bit calmer; allow occasional two-session days elsewhere.
	if (daysAgo === 0) return 1;
	return Math.random() < 0.25 ? 2 : 1;
}

function createHeartbeatEvents(opts: {
	device_id: string;
	artifact: Awaited<ReturnType<typeof urlToArtifact>>;
	startMs: number;
	durationMin: number;
}): TelemetryEvent[] {
	const heartbeatCount = Math.min(Math.floor((opts.durationMin * 60 * 1000) / HEARTBEAT_INTERVAL_MS), MAX_HEARTBEATS_PER_SESSION);
	const out: TelemetryEvent[] = [];
	for (let i = 0; i < heartbeatCount; i += 1) {
		const emitted_at = opts.startMs + i * HEARTBEAT_INTERVAL_MS;
		out.push({
			schema_version: 1,
			event_id: crypto.randomUUID(),
			device_id: opts.device_id,
			emitted_at,
			received_at: emitted_at,
			type: 'artifact_active',
			artifact: opts.artifact,
			payload: {
				interval_ms: HEARTBEAT_INTERVAL_MS,
				active_signals: { window_focused: true, tab_active: true, user_idle: false },
			},
		});
	}
	return out;
}

function maybeCaptureEvent(opts: {
	device_id: string;
	artifact: Awaited<ReturnType<typeof urlToArtifact>>;
	startMs: number;
	topic: TopicSlug;
}): TelemetryEvent | null {
	if (Math.random() >= 0.35) return null;
	const emitted_at = opts.startMs + randInt(1, 10) * 60 * 1000;
	return {
		schema_version: 1,
		event_id: crypto.randomUUID(),
		device_id: opts.device_id,
		emitted_at,
		received_at: emitted_at,
		type: 'capture',
		artifact: opts.artifact,
		payload: {
			capture_type: Math.random() < 0.55 ? 'term' : 'question',
			label: opts.topic === 'frontend' ? 'useEffect cleanup' : opts.topic === 'backend' ? 'idempotency key' : 'CAP theorem',
		},
	};
}

function maybeTopicOverrideEvent(opts: {
	device_id: string;
	artifact: Awaited<ReturnType<typeof urlToArtifact>>;
	startMs: number;
	topic: TopicSlug;
}): TelemetryEvent | null {
	if (Math.random() >= 0.15) return null;
	const emitted_at = opts.startMs;
	return {
		schema_version: 1,
		event_id: crypto.randomUUID(),
		device_id: opts.device_id,
		emitted_at,
		received_at: emitted_at,
		type: 'topic_override',
		artifact: opts.artifact,
		payload: {
			topic_slug: opts.topic,
			scope: 'artifact',
		},
	};
}

async function getArtifact(opts: { cache: Map<string, Awaited<ReturnType<typeof urlToArtifact>>>; url: string }) {
	const cached = opts.cache.get(opts.url);
	if (cached) return cached;
	const next = await urlToArtifact(opts.url);
	opts.cache.set(opts.url, next);
	return next;
}

async function createSessionEvents(opts: {
	device_id: string;
	artifactCache: Map<string, Awaited<ReturnType<typeof urlToArtifact>>>;
	dayBase: number;
}): Promise<TelemetryEvent[]> {
	const source = pick(SAMPLE_SOURCES);
	const artifact = await getArtifact({ cache: opts.artifactCache, url: source.url });
	const durationMin = randInt(15, 90);
	const startOffsetMin = randInt(8 * 60, 21 * 60);
	const startMs = opts.dayBase + startOffsetMin * 60 * 1000;

	const out: TelemetryEvent[] = [];
	out.push(...createHeartbeatEvents({ device_id: opts.device_id, artifact, startMs, durationMin }));

	const capture = maybeCaptureEvent({ device_id: opts.device_id, artifact, startMs, topic: source.topic });
	if (capture) out.push(capture);

	const override = maybeTopicOverrideEvent({ device_id: opts.device_id, artifact, startMs, topic: source.topic });
	if (override) out.push(override);

	return out;
}

async function createDayEvents(opts: {
	device_id: string;
	artifactCache: Map<string, Awaited<ReturnType<typeof urlToArtifact>>>;
	daysAgo: number;
}): Promise<TelemetryEvent[]> {
	if (!shouldHaveActivityForDay(opts.daysAgo)) return [];
	const dayBase = dateAtUtcNoonOffset(opts.daysAgo);
	const sessions = sessionCountForDay(opts.daysAgo);
	const out: TelemetryEvent[] = [];
	for (let s = 0; s < sessions; s += 1) {
		out.push(...(await createSessionEvents({ device_id: opts.device_id, artifactCache: opts.artifactCache, dayBase })));
	}
	return out;
}

export async function generateSampleEvents(opts: { device_id: string; timezone: string }): Promise<TelemetryEvent[]> {
	const events: TelemetryEvent[] = [];
	const { device_id } = opts;
	const artifactCache = new Map<string, Awaited<ReturnType<typeof urlToArtifact>>>();

	for (let daysAgo = SAMPLE_DAYS - 1; daysAgo >= 0; daysAgo -= 1) {
		events.push(...(await createDayEvents({ device_id, artifactCache, daysAgo })));
	}

	// Guarantee at least one capture so the demo doesn't look "empty".
	if (!events.some((e) => e.type === 'capture')) {
		const artifact = await getArtifact({ cache: artifactCache, url: SAMPLE_SOURCES[1]?.url ?? 'https://react.dev/learn' });
		const emitted_at = Date.now() - 5 * 60 * 1000;
		events.push({
			schema_version: 1,
			event_id: crypto.randomUUID(),
			device_id,
			emitted_at,
			received_at: emitted_at,
			type: 'capture',
			artifact,
			payload: {
				capture_type: 'term',
				label: 'idempotency key',
				note: 'Demo capture (synthetic)',
			},
		});
	}

	events.sort((a, b) => a.emitted_at - b.emitted_at);
	return events;
}

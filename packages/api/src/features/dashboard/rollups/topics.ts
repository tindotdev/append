/**
 * Topic resolution (heuristics + overrides).
 * Ported from web/src/features/dashboard/telemetry/rollups.ts.
 */

import type { DbEventRow, TopicSlug } from './types';

export const TOPIC_LABELS: Record<TopicSlug, string> = {
	foundations: 'Foundations',
	backend: 'Backend',
	frontend: 'Frontend',
	'dx-tooling': 'DX Tooling',
	'deep-concepts': 'Deep Concepts',
};

/**
 * Default topic assignment based on host heuristics.
 */
export function topicDefaultForHost(host: string): TopicSlug {
	if (host.endsWith('react.dev') || host.endsWith('developer.mozilla.org')) return 'frontend';
	if (host.includes('typescriptlang') || host.includes('vite') || host.includes('cloudflare')) return 'dx-tooling';
	if (host.includes('postgresql') || host.includes('drizzle') || host.includes('orm')) return 'backend';
	if (host.includes('wikipedia')) return 'foundations';
	return 'deep-concepts';
}

export interface TopicOverride {
	topic: TopicSlug;
	starts_at?: number;
	ends_at?: number;
	emitted_at: number; // Track when override was created for precedence
}

/**
 * Build an index of topic overrides by artifact key (host:url_hash).
 * Overrides are sorted by emitted_at DESC so the latest override is checked first.
 */
export function buildTopicOverrideIndex(rows: DbEventRow[]): Map<string, TopicOverride[]> {
	const byArtifact = new Map<string, TopicOverride[]>();

	for (const row of rows) {
		if (row.type !== 'topic_override') continue;
		if (!row.artifactHost || !row.artifactUrlHash) continue;

		const key = `${row.artifactHost}:${row.artifactUrlHash}`;
		const payload = JSON.parse(row.payloadJson) as { topic_slug: TopicSlug; starts_at?: number; ends_at?: number };

		const list = byArtifact.get(key) ?? [];
		list.push({
			topic: payload.topic_slug,
			starts_at: payload.starts_at,
			ends_at: payload.ends_at,
			emitted_at: row.emittedAt.getTime(),
		});
		byArtifact.set(key, list);
	}

	// Sort each artifact's overrides by emitted_at DESC so latest override wins
	for (const overrides of byArtifact.values()) {
		overrides.sort((a, b) => b.emitted_at - a.emitted_at);
	}

	return byArtifact;
}

/**
 * Resolve topic for a given artifact at a given time.
 * Priority: override (time-range check) > heuristic fallback
 */
export function resolveTopicForArtifact(opts: {
	host: string;
	artifactKey: string;
	emitted_at: number;
	overridesByArtifact: Map<string, TopicOverride[]>;
}): TopicSlug {
	const { host, artifactKey, emitted_at, overridesByArtifact } = opts;
	const overrides = overridesByArtifact.get(artifactKey) ?? [];

	// Check overrides first (in order)
	for (const o of overrides) {
		const startsOk = o.starts_at == null || emitted_at >= o.starts_at;
		const endsOk = o.ends_at == null || emitted_at <= o.ends_at;
		if (startsOk && endsOk) return o.topic;
	}

	return topicDefaultForHost(host);
}

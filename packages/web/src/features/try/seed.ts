import { normalizeTerm } from './normalize';
import type { TryBucket, TryState, TryTerm } from './types';

const DEFAULT_BUCKETS: TryBucket[] = [
	{
		slug: 'foundations',
		name: 'Foundations',
		description: 'Core CS concepts, algorithms, data structures',
		order: 0,
	},
	{
		slug: 'backend',
		name: 'Backend',
		description: 'Server-side patterns, APIs, databases, storage',
		order: 1,
	},
	{
		slug: 'frontend',
		name: 'Frontend',
		description: 'UI patterns, React, state management, conflict UX',
		order: 2,
	},
	{
		slug: 'dx-tooling',
		name: 'DX Tooling',
		description: 'Build tools, migrations, scripts, CI/CD',
		order: 3,
	},
	{
		slug: 'deep-concepts',
		name: 'Deep Concepts',
		description: 'System design, CAP theorem, architecture',
		order: 4,
	},
];

function seedTerm(opts: { displayTerm: string; definition: string; bucket: TryBucket['slug']; createdAtMs: number }): TryTerm {
	const termId = crypto.randomUUID();
	const senseId = crypto.randomUUID();
	return {
		termId,
		displayTerm: opts.displayTerm,
		canonical: normalizeTerm(opts.displayTerm),
		termVersion: 1,
		source: 'seed',
		primarySense: {
			id: senseId,
			bucket: opts.bucket,
			text: opts.definition,
			createdAt: opts.createdAtMs,
			version: 1,
		},
	};
}

export function createSeedState(nowMs = Date.now()): TryState {
	// Spread sample items over time so "Added" feels realistic.
	const t = (minsAgo: number) => nowMs - minsAgo * 60_000;

	const terms: TryTerm[] = [
		seedTerm({
			displayTerm: 'Idempotency key',
			definition: 'A client-generated token that makes retries safe by ensuring a request is only applied once (or returns the same result).',
			bucket: 'backend',
			createdAtMs: t(12),
		}),
		seedTerm({
			displayTerm: 'Conflict detection',
			definition: 'A technique (often via versions/ETags) to prevent overwriting concurrent edits and force an explicit resolution step.',
			bucket: 'frontend',
			createdAtMs: t(48),
		}),
		seedTerm({
			displayTerm: 'Sessionization',
			definition: 'Deriving contiguous activity sessions from heartbeat events using a gap/idle cutoff and a max credit per heartbeat.',
			bucket: 'foundations',
			createdAtMs: t(120),
		}),
		seedTerm({
			displayTerm: 'Outbox pattern',
			definition: 'Queue writes locally and sync asynchronously with retries, ensuring UI stays responsive and operations are durable.',
			bucket: 'dx-tooling',
			createdAtMs: t(240),
		}),
		seedTerm({
			displayTerm: 'CAP theorem',
			definition: 'In the presence of partitions, distributed systems must choose between consistency and availability for a given operation.',
			bucket: 'deep-concepts',
			createdAtMs: t(480),
		}),
	];

	return {
		version: 1,
		seededAtMs: nowMs,
		buckets: DEFAULT_BUCKETS,
		terms,
	};
}

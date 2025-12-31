/**
 * Default buckets seeded for new users.
 * These are tech-focused but users can edit/delete them.
 */
export const DEFAULT_BUCKETS = [
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
] as const;

export type DefaultBucket = (typeof DEFAULT_BUCKETS)[number];
export type DefaultBucketSlug = DefaultBucket['slug'];

/** Maximum buckets per user */
export const MAX_BUCKETS_PER_USER = 20;

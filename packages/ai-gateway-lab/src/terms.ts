// 20 test terms covering all 5 buckets (4 per bucket)
export const TEST_TERMS = [
	// foundations (4)
	'Hash Table',
	'Big O Notation',
	'Binary Search',
	'Recursion',
	// backend (4)
	'REST API',
	'Database Index',
	'Connection Pool',
	'Rate Limiting',
	// frontend (4)
	'React Hooks',
	'Virtual DOM',
	'CSS Grid',
	'State Management',
	// dx-tooling (4)
	'Webpack',
	'ESLint',
	'CI/CD Pipeline',
	'Hot Module Replacement',
	// deep-concepts (4)
	'CAP Theorem',
	'Event Sourcing',
	'CQRS',
	'Eventual Consistency',
] as const;

export type TestTerm = (typeof TEST_TERMS)[number];

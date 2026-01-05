import typescriptParser from '@typescript-eslint/parser';
import boundaries from 'eslint-plugin-boundaries';

export default [
	{
		files: ['src/**/*.ts', 'src/**/*.tsx'],
		languageOptions: {
			parser: typescriptParser,
		},
		plugins: {
			boundaries,
		},
		settings: {
			'boundaries/include': ['src/**/*'],
			'boundaries/elements': [
				// Features - each feature is a vertical slice (capture name for same-feature imports)
				{
					type: 'feature',
					pattern: 'features/*',
					capture: ['featureName'],
				},
				// Shared UI components - only src/components/, not features/*/components/
				{
					type: 'components',
					pattern: 'src/components/**/*',
					mode: 'full',
				},
				{
					type: 'lib',
					pattern: 'lib',
				},
				// Shared hooks - only src/hooks/, not features/*/hooks/
				{
					type: 'hooks',
					pattern: 'src/hooks/**/*',
					mode: 'full',
				},
				{
					type: 'routes',
					pattern: 'routes',
				},
				// App-level files (main.tsx, providers.tsx, etc.)
				{
					type: 'app',
					pattern: 'src/*.{ts,tsx}',
					mode: 'full',
				},
				// Test setup/support files
				{
					type: 'test',
					pattern: 'src/test/**/*',
					mode: 'full',
				},
			],
			'boundaries/ignore': ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/routeTree.gen.ts'],
			'import/resolver': {
				typescript: {
					alwaysTryTypes: true,
				},
			},
		},
		rules: {
			'boundaries/element-types': [
				2,
				{
					default: 'disallow',
					rules: [
						// Features can import from the same feature, lib, components, and hooks
						// Also allows importing from 'outbox' feature (app-level infrastructure)
						{
							from: ['feature'],
							allow: [
								['feature', { featureName: `\${from.featureName}` }], // Same feature only
								['feature', { featureName: 'outbox' }], // Outbox is shared infrastructure
								'lib',
								'components',
								'hooks',
							],
						},
						// Outbox feature can import from auth (session) and batch (query keys)
						{
							from: [['feature', { featureName: 'outbox' }]],
							allow: [
								['feature', { featureName: 'outbox' }],
								['feature', { featureName: 'auth' }],
								['feature', { featureName: 'batch' }],
								'lib',
								'components',
								'hooks',
							],
						},
						// Components can import from lib, hooks, features (for AuthProvider context), and other components (UI primitives compose)
						{
							from: ['components'],
							allow: ['lib', 'hooks', 'feature', 'components'],
						},
						// Lib has no internal dependencies
						{
							from: ['lib'],
							allow: [],
						},
						// Hooks can import from lib only
						{
							from: ['hooks'],
							allow: ['lib'],
						},
						// Routes can import from features, components, hooks, and lib
						{
							from: ['routes'],
							allow: ['feature', 'components', 'hooks', 'lib'],
						},
						// App-level files can import everything including each other
						{
							from: ['app'],
							allow: ['feature', 'components', 'hooks', 'lib', 'routes', 'app'],
						},
						// Test utilities can import from anywhere
						{
							from: ['test'],
							allow: ['feature', 'components', 'hooks', 'lib', 'routes', 'app', 'test'],
						},
					],
				},
			],
			'boundaries/no-unknown-files': [1],
		},
	},
];

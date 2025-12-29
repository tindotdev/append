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
						// Features can import from the same feature, lib, and components
						{
							from: ['feature'],
							allow: [
								['feature', { featureName: `\${from.featureName}` }], // Same feature only
								'lib',
								'components',
							],
						},
						// Components can import from lib, features (for AuthProvider context), and other components (UI primitives compose)
						{
							from: ['components'],
							allow: ['lib', 'feature', 'components'],
						},
						// Lib has no internal dependencies
						{
							from: ['lib'],
							allow: [],
						},
						// Routes can import from features, components, and lib
						{
							from: ['routes'],
							allow: ['feature', 'components', 'lib'],
						},
						// App-level files can import everything including each other
						{
							from: ['app'],
							allow: ['feature', 'components', 'lib', 'routes', 'app'],
						},
					],
				},
			],
			'boundaries/no-unknown-files': [1],
		},
	},
];

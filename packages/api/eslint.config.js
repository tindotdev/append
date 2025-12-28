import boundaries from 'eslint-plugin-boundaries';
import typescriptParser from '@typescript-eslint/parser';

export default [
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			parser: typescriptParser,
		},
		plugins: {
			boundaries,
		},
		settings: {
			'boundaries/include': ['src/**/*'],
			'boundaries/elements': [
				// Features - each feature is a vertical slice
				{
					type: 'feature',
					pattern: 'features/*',
					capture: ['featureName'],
				},
				// Shared layers - match folder and all files within
				{
					type: 'shared',
					pattern: 'shared',
				},
				{
					type: 'db',
					pattern: 'db',
				},
				{
					type: 'lib',
					pattern: 'lib',
				},
				{
					type: 'platform',
					pattern: 'platform',
				},
				// App entry point
				{
					type: 'app',
					pattern: 'src/*.ts',
					mode: 'full',
				},
			],
			'boundaries/ignore': ['**/*.test.ts', '**/*.spec.ts'],
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
						// Features can import from same feature, shared, db, lib, platform
						{
							from: ['feature'],
							allow: [
								['feature', { featureName: '${from.featureName}' }], // Same feature only
								'shared',
								'db',
								'lib',
								'platform',
							],
						},
						// Shared can import from db only (for schema types)
						{
							from: ['shared'],
							allow: ['db'],
						},
						// DB has no internal dependencies
						{
							from: ['db'],
							allow: [],
						},
						// Lib can import from shared and db
						{
							from: ['lib'],
							allow: ['shared', 'db'],
						},
						// Platform can import from shared and db
						{
							from: ['platform'],
							allow: ['shared', 'db'],
						},
						// App entry can import everything
						{
							from: ['app'],
							allow: ['feature', 'shared', 'db', 'lib', 'platform'],
						},
					],
				},
			],
			'boundaries/no-unknown-files': [1],
		},
	},
];

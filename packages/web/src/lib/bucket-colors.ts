// Theme-consistent color palette for bucket customization
// Based on packages/web/src/main.css theme variables

export const BUCKET_COLORS = [
	// Primary colors (from theme chart colors)
	{ value: 'hsl(var(--chart-1))', label: 'Chart 1', css: 'chart-1' },
	{ value: 'hsl(var(--chart-2))', label: 'Chart 2', css: 'chart-2' },

	// Semantic colors
	{ value: 'hsl(var(--destructive))', label: 'Red', name: 'red' },
	{ value: 'hsl(var(--primary))', label: 'Primary', name: 'primary' },
	{ value: 'hsl(var(--accent))', label: 'Accent', name: 'accent' },

	// Additional vibrant colors (oklch for consistency)
	{ value: 'oklch(0.75 0.20 140)', label: 'Green', name: 'green' },
	{ value: 'oklch(0.65 0.25 30)', label: 'Orange', name: 'orange' },
	{ value: 'oklch(0.70 0.22 260)', label: 'Blue', name: 'blue' },
	{ value: 'oklch(0.65 0.22 300)', label: 'Purple', name: 'purple' },
	{ value: 'oklch(0.70 0.20 330)', label: 'Pink', name: 'pink' },
	{ value: 'oklch(0.65 0.18 180)', label: 'Cyan', name: 'cyan' },
	{ value: 'oklch(0.60 0.15 75)', label: 'Yellow', name: 'yellow' },

	// Neutral options
	{ value: 'hsl(var(--muted-foreground))', label: 'Gray', name: 'gray' },
	{ value: null, label: 'No Color', name: null },
] as const;

export type BucketColor = (typeof BUCKET_COLORS)[number]['value'];

export const CAPTURE_NAV = { to: '/batch/new', label: 'Capture' } as const;

export const HEADER_NAV = [
	{ to: '/batch', label: 'Batches' },
	{ to: '/search', label: 'Search' },
	{ to: '/import', label: 'Import' },
	{ to: '/export', label: 'Export' },
	{ to: '/settings', label: 'Settings' },
] as const;

export const NAV_LINKS = [CAPTURE_NAV, ...HEADER_NAV] as const;

export type NavRoute = (typeof NAV_LINKS)[number]['to'];

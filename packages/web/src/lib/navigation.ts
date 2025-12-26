import { BUCKET_OPTIONS } from '@append/contracts/types';

export const CAPTURE_NAV = { to: '/batch/new', label: 'Capture' } as const;

export const HEADER_NAV = [
	{ to: '/search', label: 'Search' },
	{ to: '/export', label: 'Export' },
] as const;

export const NAV_LINKS = [CAPTURE_NAV, ...HEADER_NAV] as const;

export const BUCKETS = BUCKET_OPTIONS;

export type NavRoute = (typeof NAV_LINKS)[number]['to'];

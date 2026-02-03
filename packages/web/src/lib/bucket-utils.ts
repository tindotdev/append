/**
 * Shared bucket utilities for slug validation and generation.
 */

/** Slug validation regex: lowercase alphanumeric with hyphens (no leading/trailing/consecutive hyphens) */
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Convert text to a URL-friendly slug.
 * Matches backend validation: lowercase, hyphens, 2-32 chars.
 */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 32);
}

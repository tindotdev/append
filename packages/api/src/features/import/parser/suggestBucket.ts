/**
 * Derive bucket slug from filename.
 *
 * Examples:
 * - foundations.md → foundations
 * - deep-concepts.md → deep-concepts
 * - dx-toolings.md → dx-tooling (normalize common variants)
 * - MY_FILE.MD → my-file
 */

/**
 * Suggest a bucket slug from a filename.
 *
 * @param filename - The file name (e.g., "foundations.md")
 * @returns Suggested bucket slug or null if cannot determine
 */
export function suggestBucketSlug(filename: string): string | null {
	if (!filename) return null;

	// Remove .md extension (case insensitive)
	let slug = filename.replace(/\.md$/i, '');

	// Convert to lowercase
	slug = slug.toLowerCase();

	// Replace underscores and spaces with hyphens
	slug = slug.replace(/[_\s]+/g, '-');

	// Remove any characters that aren't alphanumeric or hyphen
	slug = slug.replace(/[^a-z0-9-]/g, '');

	// Collapse multiple hyphens
	slug = slug.replace(/-+/g, '-');

	// Trim leading/trailing hyphens
	slug = slug.replace(/^-+|-+$/g, '');

	// Return null if empty after processing
	if (slug === '') return null;

	return slug;
}

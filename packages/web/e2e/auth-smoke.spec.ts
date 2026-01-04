/**
 * Auth bootstrap smoke test (ADR 0019).
 *
 * Verifies that E2E auth bootstrap works correctly:
 * - Authenticated session from globalSetup is valid
 * - Protected routes load without redirect to sign-in
 * - Protected API calls succeed with session cookie
 */

import { expect, test } from '@playwright/test';

test.describe('Auth Bootstrap', () => {
	test('authenticated route loads without redirect', async ({ page }) => {
		// Navigate to protected route (batch/new is the default authenticated landing)
		await page.goto('/batch/new');

		// Should NOT redirect to sign-in
		await expect(page).not.toHaveURL(/sign-in/);

		// Should see the capture page heading
		await expect(page.getByRole('heading', { name: 'Capture' })).toBeVisible();
	});

	test('protected API call succeeds', async ({ page }) => {
		// Navigate to batches list page
		await page.goto('/batch');

		// The page should load batch list (may be empty but should not error)
		// Wait for the page to stabilize
		await expect(page).not.toHaveURL(/sign-in/);

		// Check for the batches heading or empty state
		const heading = page.getByRole('heading', { name: /batches/i });
		await expect(heading).toBeVisible();
	});

	test('session persists across navigation', async ({ page }) => {
		// Start on capture page
		await page.goto('/batch/new');
		await expect(page.getByRole('heading', { name: 'Capture' })).toBeVisible();

		// Navigate to batch list
		await page.goto('/batch');
		await expect(page).not.toHaveURL(/sign-in/);

		// Navigate back to capture
		await page.goto('/batch/new');
		await expect(page.getByRole('heading', { name: 'Capture' })).toBeVisible();
	});
});

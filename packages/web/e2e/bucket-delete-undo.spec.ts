/**
 * Bucket delete + undo E2E test.
 *
 * Tests the delete flow in bucket feed:
 * - Create a term via capture flow
 * - Navigate to bucket feed
 * - Delete the term
 * - Verify "Term deleted" toast with Undo appears
 * - Verify item removed from table
 * - Click Undo
 * - Verify item reappears
 */

import { expect, test } from '@playwright/test';
import { clickToastAction, waitForToast } from './helpers';

test.describe('Bucket Delete + Undo', () => {
	test.beforeEach(async ({ page }) => {
		// Create a term to delete via capture flow
		await page.goto('/batch/new');
		await expect(page.getByRole('heading', { name: 'Capture' })).toBeVisible();

		// Enter a unique term
		const testTermName = `delete-test-${Date.now()}`;
		const input = page.locator('input').first();
		await input.fill(testTermName);

		// Submit the batch
		await page.getByRole('button', { name: 'Submit Batch' }).click();

		// Wait for sync to complete
		await expect(page.locator('[data-sonner-toast]').filter({ hasText: /batch ready/i })).toBeVisible({
			timeout: 15000,
		});

		// Store term name for later assertions
		(page as unknown as { testTermName: string }).testTermName = testTermName;
	});

	test('delete term and undo restores it', async ({ page }) => {
		const testTermName = (page as unknown as { testTermName: string }).testTermName;

		// Navigate to default bucket (first one the user has)
		// The bucket slug should be available from the user's buckets
		await page.goto('/bucket/default');

		// Wait for table to load
		await page.waitForSelector('table');

		// Find the row with our test term
		const termCell = page.getByRole('cell', { name: testTermName });
		await expect(termCell).toBeVisible({ timeout: 10000 });

		// Click the actions menu (three dots) for this row
		const row = termCell.locator('xpath=ancestor::tr');
		const actionsButton = row.getByRole('button', { name: 'Open menu' });
		await actionsButton.click();

		// Click Delete in the dropdown
		await page.getByRole('menuitem', { name: 'Delete' }).click();

		// Verify "Term deleted" toast appears with Undo
		await waitForToast(page, /term deleted/i);

		// Verify item is removed from table
		await expect(termCell).not.toBeVisible({ timeout: 3000 });

		// Click Undo in the toast
		await clickToastAction(page, 'Undo');

		// Verify "Restored" confirmation toast
		await waitForToast(page, /restored/i);

		// Verify item reappears in table
		await expect(page.getByRole('cell', { name: testTermName })).toBeVisible({ timeout: 5000 });
	});

	test('delete term without undo removes it permanently from view', async ({ page }) => {
		const testTermName = (page as unknown as { testTermName: string }).testTermName;

		// Navigate to bucket
		await page.goto('/bucket/default');

		// Wait for table to load
		await page.waitForSelector('table');

		// Find and delete the term
		const termCell = page.getByRole('cell', { name: testTermName });
		await expect(termCell).toBeVisible({ timeout: 10000 });

		const row = termCell.locator('xpath=ancestor::tr');
		const actionsButton = row.getByRole('button', { name: 'Open menu' });
		await actionsButton.click();

		await page.getByRole('menuitem', { name: 'Delete' }).click();

		// Wait for toast and let it dismiss (don't click Undo)
		await waitForToast(page, /term deleted/i);

		// Wait for toast to disappear
		await page.waitForTimeout(6000);

		// Term should remain deleted
		await expect(termCell).not.toBeVisible();
	});
});

/**
 * Outbox happy path E2E test.
 *
 * Tests the capture flow:
 * - Enter terms in composer
 * - Submit batch
 * - See "Queued for sync" toast
 * - See "Batch ready" toast when synced
 * - Navigate to batch detail
 */

import { expect, test } from '@playwright/test';

test.describe('Outbox Happy Path', () => {
	test('capture flow: enter terms, submit, sync, open batch', async ({ page }) => {
		// Navigate to capture page
		await page.goto('/batch/new');
		await expect(page.getByRole('heading', { name: 'Capture' })).toBeVisible();

		// Enter some terms
		const input = page.locator('input').first();
		await input.fill('test term 1');
		await input.press('Enter');

		// Second term (new row was created)
		const inputs = page.locator('input');
		await inputs.nth(1).fill('test term 2');

		// Submit the batch
		await page.getByRole('button', { name: 'Submit Batch' }).click();

		// Should see "Queued for sync" toast
		await expect(page.locator('[data-sonner-toast]').filter({ hasText: /queued/i })).toBeVisible({
			timeout: 5000,
		});

		// Wait for "Batch ready" toast (sync completed)
		await expect(page.locator('[data-sonner-toast]').filter({ hasText: /batch ready/i })).toBeVisible({
			timeout: 15000,
		});

		// Click "Open" in the toast to navigate to batch
		await page
			.locator('[data-sonner-toast]')
			.filter({ hasText: /batch ready/i })
			.getByRole('button', { name: 'Open' })
			.click();

		// Should be on batch detail page
		await expect(page).toHaveURL(/\/batch\/[a-f0-9-]+/);

		// Should see the terms we submitted
		await expect(page.getByText('test term 1')).toBeVisible();
		await expect(page.getByText('test term 2')).toBeVisible();
	});

	test('composer clears after submit', async ({ page }) => {
		await page.goto('/batch/new');

		// Enter a term
		const input = page.locator('input').first();
		await input.fill('term to clear');

		// Submit
		await page.getByRole('button', { name: 'Submit Batch' }).click();

		// Wait for queued toast
		await expect(page.locator('[data-sonner-toast]').filter({ hasText: /queued/i })).toBeVisible({
			timeout: 5000,
		});

		// Input should be cleared
		await expect(input).toHaveValue('');
	});
});

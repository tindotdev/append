/**
 * Outbox single-sender test with Web Locks (T16).
 *
 * Tests that only one tab sends the batch when multiple tabs are open,
 * using the Web Locks API for leadership coordination.
 */

import { expect, test } from '@playwright/test';
import { interceptBatchPosts } from './helpers';

test.describe('Outbox Single Sender (Web Locks)', () => {
	test('two pages, one enqueue, exactly 1 POST', async ({ context }) => {
		// Create two pages (tabs)
		const page1 = await context.newPage();
		const page2 = await context.newPage();

		// Set up request interception on both pages
		const interceptor1 = interceptBatchPosts(page1);
		const interceptor2 = interceptBatchPosts(page2);

		// Navigate both pages to the app
		await page1.goto('/batch/new');
		await page2.goto('/batch/new');

		// Wait for both pages to load
		await expect(page1.getByRole('heading', { name: 'Capture' })).toBeVisible();
		await expect(page2.getByRole('heading', { name: 'Capture' })).toBeVisible();

		// Enter terms on page1 and submit
		const input = page1.locator('input').first();
		await input.fill('multi-tab test term');
		await page1.getByRole('button', { name: 'Submit Batch' }).click();

		// Wait for queued toast on page1
		await expect(page1.locator('[data-sonner-toast]').filter({ hasText: /queued/i })).toBeVisible({
			timeout: 5000,
		});

		// Wait for batch ready toast (on either page, but should appear)
		const batchReadyPromise = Promise.race([
			page1
				.locator('[data-sonner-toast]')
				.filter({ hasText: /batch ready/i })
				.waitFor({ timeout: 15000 }),
			page2
				.locator('[data-sonner-toast]')
				.filter({ hasText: /batch ready/i })
				.waitFor({ timeout: 15000 }),
		]);
		await batchReadyPromise;

		// Give a moment for any duplicate requests to occur
		await page1.waitForTimeout(500);

		// Check that exactly 1 POST was made across both pages
		const totalPosts = interceptor1.getCount() + interceptor2.getCount();
		expect(totalPosts).toBe(1);
	});
});

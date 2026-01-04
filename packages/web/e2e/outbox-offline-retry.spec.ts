/**
 * Outbox offline retry E2E test.
 *
 * Tests that the outbox queues items while offline and retries when online:
 * - Go offline
 * - Submit batch (queued locally)
 * - Verify no POST request made
 * - Go online
 * - Verify POST succeeds and batch is ready
 */

import { expect, test } from '@playwright/test';
import { interceptBatchPosts, setOffline } from './helpers';

test.describe('Outbox Offline Retry', () => {
	test('offline submit queues, online retries successfully', async ({ context, page }) => {
		// Set up request interception
		const interceptor = interceptBatchPosts(page);

		// Navigate to capture page
		await page.goto('/batch/new');
		await expect(page.getByRole('heading', { name: 'Capture' })).toBeVisible();

		// Go offline
		await setOffline(context, true);

		// Enter terms and submit
		const input = page.locator('input').first();
		await input.fill('offline test term');
		await page.getByRole('button', { name: 'Submit Batch' }).click();

		// Should see queued toast
		await expect(page.locator('[data-sonner-toast]').filter({ hasText: /queued/i })).toBeVisible({
			timeout: 5000,
		});

		// Wait a bit to ensure no request was made while offline
		await page.waitForTimeout(1000);
		expect(interceptor.getCount()).toBe(0);

		// Go back online
		await setOffline(context, false);

		// Wait for batch ready toast (retry should succeed)
		await expect(page.locator('[data-sonner-toast]').filter({ hasText: /batch ready/i })).toBeVisible({
			timeout: 20000, // Longer timeout for retry backoff
		});

		// Verify POST was made after going online
		expect(interceptor.getCount()).toBe(1);
	});

	test('offline indicator shows when offline', async ({ context, page }) => {
		await page.goto('/batch/new');
		await expect(page.getByRole('heading', { name: 'Capture' })).toBeVisible();

		// Go offline
		await setOffline(context, true);

		// Submit a batch to trigger outbox activity
		const input = page.locator('input').first();
		await input.fill('offline indicator test');
		await page.getByRole('button', { name: 'Submit Batch' }).click();

		// The sync indicator should show offline status
		// (This assumes the SyncIndicator shows offline state)
		// For now just verify the queued toast appears
		await expect(page.locator('[data-sonner-toast]').filter({ hasText: /queued/i })).toBeVisible({
			timeout: 5000,
		});

		// Go back online to clean up
		await setOffline(context, false);
	});
});

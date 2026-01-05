/**
 * E2E test helpers for outbox and API interaction testing.
 */

import type { BrowserContext, Page, Route } from '@playwright/test';

/**
 * Intercept and count POST requests to /api/batch.
 * Returns an object with captured request data and a function to get the count.
 */
export function interceptBatchPosts(page: Page): {
	getCount: () => number;
	getRequests: () => Array<{ url: string; body: unknown }>;
	waitForRequest: (timeoutMs?: number) => Promise<{ url: string; body: unknown }>;
} {
	const requests: Array<{ url: string; body: unknown }> = [];
	// Queue of pending resolvers to avoid race condition when called concurrently
	const pendingResolvers: Array<(req: { url: string; body: unknown }) => void> = [];

	page.route('**/api/batch', async (route: Route, request) => {
		if (request.method() === 'POST') {
			const body = request.postDataJSON();
			const captured = { url: request.url(), body };
			requests.push(captured);

			// Resolve the oldest pending waiter (FIFO)
			if (pendingResolvers.length > 0) {
				const resolver = pendingResolvers.shift()!;
				resolver(captured);
			}
		}

		// Continue with the actual request
		await route.continue();
	});

	return {
		getCount: () => requests.length,
		getRequests: () => requests,
		waitForRequest: (timeoutMs = 5000) =>
			new Promise((resolve, reject) => {
				// Check if we already have a request
				if (requests.length > 0) {
					resolve(requests[requests.length - 1]);
					return;
				}

				pendingResolvers.push(resolve);
				setTimeout(() => {
					const index = pendingResolvers.indexOf(resolve);
					if (index >= 0) {
						pendingResolvers.splice(index, 1);
						reject(new Error(`No batch POST request within ${timeoutMs}ms`));
					}
				}, timeoutMs);
			}),
	};
}

/**
 * Disable Web Locks API to force lease-based fallback for leadership.
 * Must be called before navigating to the page.
 */
export async function disableWebLocks(page: Page): Promise<void> {
	await page.addInitScript(() => {
		// @ts-expect-error - intentionally breaking the API for testing
		delete navigator.locks;
	});
}

/**
 * Toggle offline mode for the browser context.
 */
export async function setOffline(context: BrowserContext, offline: boolean): Promise<void> {
	await context.setOffline(offline);
}

/**
 * Override the UNDO_GRACE_MS constant to speed up tests.
 * Must be called before navigating to the page.
 *
 * Note: This injects a script that modifies the window object.
 * The outbox module would need to check for this override.
 */
export async function setUndoGraceMs(page: Page, ms: number): Promise<void> {
	await page.addInitScript((graceMs) => {
		// Set on window for the outbox module to pick up
		(window as unknown as { __E2E_UNDO_GRACE_MS?: number }).__E2E_UNDO_GRACE_MS = graceMs;
	}, ms);
}

/**
 * Wait for a toast with specific text to appear.
 */
export async function waitForToast(page: Page, textPattern: string | RegExp): Promise<void> {
	// Sonner toasts appear in [data-sonner-toaster] or similar container
	await page.locator('[data-sonner-toast]', { hasText: textPattern }).waitFor({
		state: 'visible',
		timeout: 10000,
	});
}

/**
 * Click the action button in a toast.
 */
export async function clickToastAction(page: Page, actionLabel: string): Promise<void> {
	await page.locator('[data-sonner-toast]').getByRole('button', { name: actionLabel }).click();
}

/**
 * Clear IndexedDB outbox data for a clean test state.
 * Run this in page context after navigation.
 */
export async function clearOutboxData(page: Page, userScope: string): Promise<void> {
	await page.evaluate(async (scope) => {
		const dbName = `outbox_${scope}`;
		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.deleteDatabase(dbName);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}, userScope);
}

/**
 * Get the current count of items in the outbox.
 */
export async function getOutboxCount(page: Page): Promise<{ pending: number; failed: number }> {
	return await page.evaluate(async () => {
		// This assumes the outbox exposes counts via a global or the UI
		// For now, we'll check the SyncIndicator if visible
		const syncIndicator = document.querySelector('[data-testid="sync-indicator"]');
		if (!syncIndicator) {
			return { pending: 0, failed: 0 };
		}

		// Parse from aria-label or data attributes
		const pending = Number.parseInt(syncIndicator.getAttribute('data-pending') ?? '0', 10);
		const failed = Number.parseInt(syncIndicator.getAttribute('data-failed') ?? '0', 10);

		return { pending, failed };
	});
}

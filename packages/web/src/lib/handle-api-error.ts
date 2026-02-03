import { ApiRequestError } from '@/lib/api-rpc';

export function handleApiError(
	err: unknown,
	handlers: {
		onConflict?: (code: string | undefined, details: Record<string, unknown> | undefined) => void;
		onNotFound?: () => void;
		onUnauthorized?: () => void;
		onDefault?: () => void;
	}
): void {
	if (err instanceof ApiRequestError) {
		if (err.status === 401 && handlers.onUnauthorized) {
			handlers.onUnauthorized();
			return;
		}
		if (err.status === 409 && handlers.onConflict) {
			handlers.onConflict(err.code, err.details);
			return;
		}
		if (err.status === 404 && handlers.onNotFound) {
			handlers.onNotFound();
			return;
		}
	}
	if (!handlers.onDefault) {
		console.error('[handleApiError] Unhandled error:', err);
	}
	handlers.onDefault?.();
}

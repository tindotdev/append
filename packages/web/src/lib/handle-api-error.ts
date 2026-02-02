import { ApiRequestError } from '@/lib/api-rpc';

export function handleApiError(
	err: unknown,
	handlers: {
		onConflict?: (code: string | undefined, details: Record<string, unknown> | undefined) => void;
		onNotFound?: () => void;
		onDefault?: () => void;
	}
): void {
	if (err instanceof ApiRequestError) {
		if (err.status === 409 && handlers.onConflict) {
			handlers.onConflict(err.code, err.details);
			return;
		}
		if (err.status === 404 && handlers.onNotFound) {
			handlers.onNotFound();
			return;
		}
	}
	handlers.onDefault?.();
}

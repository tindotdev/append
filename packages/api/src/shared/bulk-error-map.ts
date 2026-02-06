/**
 * Shared error mapper for bulk operations.
 *
 * Maps domain errors to client-friendly error objects with consistent
 * base error types (not_found, forbidden) across all bulk operations.
 */

type BaseError = { type: string; message?: string };
type ClientError = { code: string; message: string };

/**
 * Map bulk operation error to a client-friendly error object.
 *
 * @param error - The domain error to map
 * @param additionalMappings - Operation-specific error mappings
 * @returns Client error with code and message
 */
export function mapBulkOperationError(error: BaseError, additionalMappings?: Record<string, ClientError>): ClientError {
	// Base mappings shared across all bulk operations
	const base: Record<string, ClientError> = {
		not_found: { code: 'NOT_FOUND', message: 'Resource not found' },
		forbidden: { code: 'FORBIDDEN', message: 'Access denied' },
	};

	const mappings = { ...base, ...additionalMappings };
	return mappings[error.type] ?? { code: 'UNKNOWN_ERROR', message: 'An unexpected error occurred' };
}

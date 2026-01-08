/**
 * Transport interface for sending outbox commands.
 *
 * The transport is the boundary between the outbox library and the
 * application's API layer. It handles the actual HTTP request/response
 * and maps the result to the standard outbox outcome types.
 *
 * Applications provide their own transport implementation that:
 * - Knows the endpoint URLs and auth headers
 * - Handles request serialization
 * - Maps responses to TransportResult outcomes
 */

import type { OutboxError } from './types';

// =============================================================================
// Transport Result
// =============================================================================

/**
 * Result of executing a command via transport.
 *
 * The outcome determines how the outbox handles the item:
 * - success: Delete item, broadcast result
 * - retry: Schedule next attempt with exponential backoff
 * - blocked_auth: Mark blocked, pause until auth resumes
 * - failed: Mark as permanent failure
 *
 * @template TResult - Application-specific result data (e.g., { batchId: string })
 */
export type TransportResult<TResult = unknown> =
	| { outcome: 'success'; result: TResult }
	| { outcome: 'retry'; error: OutboxError }
	| { outcome: 'blocked_auth'; error: OutboxError }
	| { outcome: 'failed'; error: OutboxError };

// =============================================================================
// Transport Interface
// =============================================================================

/**
 * Transport interface for sending commands to the server.
 *
 * @template TCommand - The command type to send
 * @template TResult - The result type on success
 */
export interface Transport<TCommand = unknown, TResult = unknown> {
	/**
	 * Execute a command and return the result.
	 *
	 * The transport is responsible for:
	 * 1. Serializing the command for the API
	 * 2. Making the HTTP request with appropriate headers
	 * 3. Parsing the response and classifying the outcome
	 * 4. Returning a TransportResult with the appropriate outcome
	 *
	 * @param command - The command to execute
	 * @returns The transport result with outcome and data/error
	 */
	execute(command: TCommand): Promise<TransportResult<TResult>>;
}

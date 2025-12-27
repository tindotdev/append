/**
 * Server-Sent Events (SSE) helpers for streaming responses.
 */

/**
 * Standard SSE response headers.
 */
export function sseHeaders(): HeadersInit {
	return {
		'Content-Type': 'text/event-stream; charset=utf-8',
		'Cache-Control': 'no-cache, no-transform',
		Connection: 'keep-alive',
	};
}

/**
 * Format a single SSE event.
 *
 * @param event - Event name (e.g., 'start', 'candidate', 'done')
 * @param data - Event data (will be JSON-stringified)
 * @returns Formatted SSE event string
 */
export function sseEvent(event: string, data: unknown): string {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Create an SSE streaming response.
 *
 * @param generator - Async generator that yields SSE event strings
 * @returns Response object with SSE stream
 */
export function sseResponse(generator: () => AsyncGenerator<string, void, unknown>): Response {
	const encoder = new TextEncoder();

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				for await (const chunk of generator()) {
					controller.enqueue(encoder.encode(chunk));
				}
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, { headers: sseHeaders() });
}

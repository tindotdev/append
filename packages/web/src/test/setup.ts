/**
 * Vitest setup file for the web package.
 *
 * Provides global mocks for browser APIs used by the outbox system:
 * - IndexedDB (via fake-indexeddb)
 * - BroadcastChannel (mock implementation)
 */

import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// Mock BroadcastChannel for cross-tab messaging tests
// The real implementation uses a BroadcastChannel to coordinate across tabs,
// but in tests we need a mock that works in a single-process environment.
class MockBroadcastChannel {
	name: string;
	onmessage: ((event: MessageEvent) => void) | null = null;

	constructor(name: string) {
		this.name = name;
	}

	postMessage(_message: unknown): void {
		// No-op in tests - use the mock broadcast wrapper for testing
	}

	close(): void {
		// No-op
	}
}

globalThis.BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel;

# @append/outbox

A durable client-side queue with cross-tab coordination for offline-first applications.

## Features

- **Durable persistence**: Items survive page refreshes and browser crashes (IndexedDB)
- **Cross-tab coordination**: Only one tab processes items at a time (Web Locks + IDB lease fallback)
- **Undo support**: Grace window for immediate undo before send
- **Retry with backoff**: Exponential backoff with jitter for transient failures
- **Auth-blocking**: Items pause when auth expires, resume on re-auth
- **Generic types**: Application-specific command and result types

## Usage

```typescript
import {
  createOutbox,
  createOutboxStore,
  createOutboxBroadcast,
  createLeadershipProvider,
  type Transport,
  type TransportResult,
} from '@append/outbox';

// 1. Define your command and result types
interface MyCommand {
  type: 'my_command';
  payload: string;
}

interface MyResult {
  id: string;
}

// 2. Implement the transport interface
const transport: Transport<MyCommand, MyResult> = {
  async execute(command) {
    const response = await fetch('/api/endpoint', {
      method: 'POST',
      body: JSON.stringify(command),
    });

    if (response.ok) {
      const result = await response.json();
      return { outcome: 'success', result };
    }

    if (response.status === 401) {
      return { outcome: 'blocked_auth', error: { status: 401, message: 'Unauthorized' } };
    }

    if (response.status >= 500) {
      return { outcome: 'retry', error: { status: response.status, message: 'Server error' } };
    }

    return { outcome: 'failed', error: { status: response.status, message: 'Failed' } };
  },
};

// 3. Create the outbox instance
const outbox = createOutbox({
  userScope: 'user-123',
  transport,
  createCommand: (options: { payload: string }) => ({
    type: 'my_command',
    payload: options.payload,
  }),
  createResultPayload: (item, result) => ({
    commandType: item.command.type,
    itemId: item.id,
    resultId: result.id,
  }),
});

// 4. Enqueue commands
const { item } = await outbox.enqueue({ payload: 'hello' });

// 5. Undo within grace window
const undoResult = await outbox.undo(item.id);
if (undoResult.success) {
  console.log('Undone:', undoResult.command);
}
```

## API

### Factory

#### `createOutbox(options)`

Creates a complete outbox instance with store, broadcast, and sender loop.

Options:
- `userScope`: User ID for isolation
- `transport`: Transport implementation for sending commands
- `createCommand`: Factory to create commands from enqueue options
- `createResultPayload`: Factory to create broadcast result payloads
- `onAuthBlocked?`: Callback when auth is blocked
- `undoGraceMs?`: Undo window duration (default: 5000ms)

Returns:
- `store`: Persistence store
- `broadcast`: Cross-tab messaging
- `senderLoop`: Processing loop
- `enqueue`: Enqueue function
- `undo`: Undo function

### Transport Interface

```typescript
interface Transport<TCommand, TResult> {
  execute(command: TCommand): Promise<TransportResult<TResult>>;
}

type TransportResult<TResult> =
  | { outcome: 'success'; result: TResult }
  | { outcome: 'retry'; error: OutboxError }
  | { outcome: 'blocked_auth'; error: OutboxError }
  | { outcome: 'failed'; error: OutboxError };
```

### Store

#### `createOutboxStore<TCommand>(userScope)`

Creates an IndexedDB-backed store.

#### `createMockOutboxStore<TCommand>()`

Creates an in-memory store for testing.

### Broadcast

#### `createOutboxBroadcast<TResult>()`

Creates a BroadcastChannel-based broadcast.

#### `createMockBroadcast<TResult>()`

Creates a mock broadcast for testing.

### Leadership

#### `createLeadershipProvider(options)`

Creates a leadership provider for cross-tab coordination.

Uses Web Locks API when available, falls back to IDB-based leases.

### Error Classification

#### `classifyResponse(status, code?)`

Classifies HTTP responses into actionable categories:
- `success`: 200, 201
- `retry`: 408, 429, 500-599
- `blocked_auth`: 401, 403
- `failed`: 400 + VALIDATION_ERROR, 409 + IDEMPOTENCY_CONFLICT, 413, 404

#### `calculateNextAttemptAt(now, attemptCount, options?)`

Calculates next retry timestamp with exponential backoff and jitter.

### Constants

- `UNDO_GRACE_MS`: 5000ms - Undo window duration
- `LEASE_MS`: 10000ms - Leadership lease duration
- `HEARTBEAT_MS`: 3000ms - Leadership heartbeat interval
- `BACKOFF_BASE_MS`: 1000ms - Base backoff delay
- `BACKOFF_CAP_MS`: 60000ms - Maximum backoff delay
- `JITTER_RANGE_MS`: 250ms - Jitter range

## Browser Support

- Chrome desktop
- Android Chrome

Requires:
- IndexedDB
- BroadcastChannel
- Web Locks API (optional, falls back to IDB lease)

## License

Private - Internal use only.

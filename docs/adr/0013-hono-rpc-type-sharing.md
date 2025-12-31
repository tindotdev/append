# ADR 0013 — Hono RPC for API Type Sharing

Status: Accepted
Date: 2025-12-31

## Context

The app originally used a shared `@append/contracts` package to define API types (request/response shapes, bucket enums). This approach had issues:

1. **Manual sync**: Types in contracts had to match API implementation manually
2. **Drift risk**: Easy for API to return different shapes than contracts declared
3. **Duplication**: Validation schemas in API, type definitions in contracts
4. **Build complexity**: Three-package dependency chain (contracts → api/web)

We needed a single source of truth for API types without manual synchronization.

## Decision

Use **Hono RPC** for end-to-end type safety:

### 1. API exports route types

```typescript
// packages/api/src/index.ts
const apiRoutes = app
  .route('/api', acceptRoutes)
  .route('/api/batch', batchRoutes)
  .route('/api/bucket', bucketRoutes)
  // ... other routes

export type AppType = typeof apiRoutes;
```

### 2. Routes use vValidator for typed validation

```typescript
// packages/api/src/features/user-bucket/routes.ts
import { vValidator } from '@hono/valibot-validator';

export const userBucketRoutes = app
  .post('/', vValidator('json', CreateBucketSchema, validationHook), async (c) => {
    const body = c.req.valid('json'); // fully typed from schema
    // ...
  });
```

### 3. Web client uses hc<AppType>

```typescript
// packages/web/src/lib/api-rpc.ts
import type { AppType } from '@append/api';
import { hc } from 'hono/client';

export const api = hc<AppType>(API_URL, {
  fetch: (input, init) => fetch(input, { ...init, credentials: 'include' }),
});

// Usage: fully typed params, query, and response
const res = await api.api.bucket[':slug'].$get({
  param: { slug },
  query: { limit: '20' },
});
```

### 4. Contracts package deprecated

The `@append/contracts` package remains in the workspace but is no longer actively used. It may be removed in a future cleanup.

## Consequences

### Positive

- **Single source of truth**: Route definitions are the type definitions
- **No manual sync**: Types automatically match implementation
- **Compile-time safety**: TypeScript catches mismatches between client and server
- **Better DX**: IDE autocomplete for all API calls

### Negative

- **Hono dependency in web**: Web package imports `hono/client` (lightweight, ~3KB)
- **Learning curve**: Team must understand Hono RPC patterns
- **Response type extraction**: Requires `InferResponseType` for complex cases

### Neutral

- **Contracts package**: Not deleted (avoids breaking changes), marked as deprecated

## Pattern Reference

### Extracting response types

```typescript
import type { InferResponseType } from 'hono/client';

type FullResponse = InferResponseType<(typeof api.api.bucket)[':slug']['$get']>;
type SuccessResponse = Extract<FullResponse, { items: unknown }>;
```

### Error handling

```typescript
const res = await api.api.batch.$post({ json: request });
if (!res.ok) {
  const error = await res.json() as ApiErrorResponse;
  throw new ApiRequestError(res.status, error.error.code, error.error.message);
}
return res.json();
```

## References

- Hono RPC docs: https://hono.dev/docs/guides/rpc
- Phase 5 implementation: commits `08ea9d4` through `b2e3d26`
- Supersedes: manual type definitions in `packages/web/src/features/*/types/`

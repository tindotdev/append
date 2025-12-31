# Phase 5: Custom Buckets + Hono RPC Migration

## Summary

Two major changes:
1. **Hono RPC**: Remove contracts package, use Hono RPC for end-to-end type safety
2. **Custom Buckets**: Replace static buckets with user-owned dynamic buckets (limit 20)

## User Requirements (Confirmed)

- **Bucket schema**: `(id, user_id, slug, name, description, color?, order)`
- **Defaults**: Seed 5 tech buckets for new users (fully editable)
- **Limit**: Max 20 buckets per user
- **Type sharing**: Hono RPC (remove contracts package)
- **Suggestion modes**: Defer (keep tech-focused prompts)

---

## Implementation Phases

### Phase 5A: Hono RPC Setup

| Task | Description |
|------|-------------|
| **5A.1** Add `@hono/valibot-validator` to API | Enable typed route validation |
| **5A.2** Refactor routes to use valibot validator | Chain validators for type inference |
| **5A.3** Export `AppType` from API | `export type AppType = typeof app` |
| **5A.4** Add `hono` client to web package | `pnpm add hono` (for `hc`) |
| **5A.5** Create typed API client in web | `hc<AppType>(baseUrl)` |
| **5A.6** Migrate one feature (bucket feed) | Prove the pattern works |
| **5A.7** Migrate remaining features | batch, candidate, suggestions, export, accept |
| **5A.8** Delete manual type files | `features/*/types/index.ts` |
| **5A.9** Remove contracts package | Delete `packages/contracts/` |
| **5A.10** Update pnpm-workspace.yaml | Remove contracts entry |

**API Route Pattern (before):**
```typescript
bucketRoutes.get('/:slug', async (c) => {
  // manual validation
  const parseResult = v.safeParse(Schema, {...});
  return c.json(result);
});
```

**API Route Pattern (after):**
```typescript
const route = bucketRoutes.get('/:slug',
  vValidator('query', GetBucketFeedParamsSchema),
  async (c) => {
    const params = c.req.valid('query'); // typed!
    return c.json(result);
  }
);
export type BucketRoutes = typeof route;
```

**Web Client Pattern:**
```typescript
import { hc } from 'hono/client';
import type { AppType } from '@append/api';

const client = hc<AppType>(API_BASE_URL);
const res = await client.api.bucket[':slug'].$get({ param: { slug } });
const data = await res.json(); // fully typed!
```

### Phase 5B: Database Schema

| Task | Description |
|------|-------------|
| **5B.1** Create ADR 0012 for custom buckets | Document decision |
| **5B.2** Add `bucket` table to Drizzle schema | `packages/api/src/db/domain.schema.ts` |
| **5B.3** Add `DEFAULT_BUCKETS` constant | In API, not contracts |
| **5B.4** Generate migration | `pnpm drizzle-kit generate` |
| **5B.5** Manually adjust migration for data | Seed defaults + add FKs |
| **5B.6** Test migration locally | Run against test D1 |

**New `bucket` table:**
```sql
CREATE TABLE bucket (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  color TEXT,
  "order" INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, slug)
);
CREATE INDEX bucket_user_order_idx ON bucket(user_id, "order");
```

**Migration steps:**
1. Create `bucket` table
2. Seed 5 defaults for each existing user
3. Add `bucket_id` to `term_sense`, `candidate` (2x), `suggestion_cache`
4. Populate `bucket_id` via slug lookup
5. Remove bucket CHECK constraints

### Phase 5C: Bucket CRUD API

| Task | Description |
|------|-------------|
| **5C.1** Create `user-bucket` feature module | Directory + routes |
| **5C.2** Implement `listBuckets` | GET /api/user-bucket |
| **5C.3** Implement `createBucket` | POST /api/user-bucket |
| **5C.4** Implement `updateBucket` | PUT /api/user-bucket/:id |
| **5C.5** Implement `deleteBucket` | DELETE /api/user-bucket/:id |
| **5C.6** Implement `reorderBuckets` | PUT /api/user-bucket/reorder |
| **5C.7** Add bucket seeding to auth | Seed on first login |
| **5C.8** Update LLM prompt builder | Dynamic from user buckets |
| **5C.9** Update generateSuggestions | Fetch buckets, pass to LLM |
| **5C.10** Update bucket feed route | Validate against user's buckets |

**API Endpoints:**
```
GET    /api/user-bucket           List buckets (ordered, with sense counts)
POST   /api/user-bucket           Create bucket (limit 20)
PUT    /api/user-bucket/:id       Update name/description/color
DELETE /api/user-bucket/:id       Delete (fails if has senses)
PUT    /api/user-bucket/reorder   Bulk reorder
```

### Phase 5D: Bucket Manager UI

| Task | Description |
|------|-------------|
| **5D.1** Create settings feature module | `packages/web/src/features/settings/` |
| **5D.2** Create `BucketManager` component | Main container |
| **5D.3** Create `BucketList` with drag-drop | @dnd-kit/core |
| **5D.4** Create `BucketForm` component | Create/edit |
| **5D.5** Add `SettingsPage` route | /settings |
| **5D.6** Update navigation | Add Settings link |
| **5D.7** Update `ProtectedLayout` | Dynamic bucket menu |
| **5D.8** Update `CandidateInputs` | Dynamic bucket dropdown |
| **5D.9** Update `BucketFeedPage` | Validate dynamic buckets |

### Phase 5E: Testing & Docs

| Task | Description |
|------|-------------|
| **5E.1** Add bucket CRUD tests | `test/user-bucket.spec.ts` |
| **5E.2** Update suggestion tests | Dynamic buckets |
| **5E.3** Update `docs/design.md` | New bucket architecture |
| **5E.4** Create ADR 0013 for Hono RPC | Document type sharing decision |
| **5E.5** Update `ROADMAP.md` | Mark Phase 5 complete |

---

## Critical Files

### Delete
- `packages/contracts/` - entire package
- `packages/web/src/features/batch/types/index.ts` - manual types
- `packages/web/src/features/bucket/types/index.ts` - manual types

### Create
- `packages/api/src/features/user-bucket/` - new feature
- `packages/web/src/features/settings/` - new feature
- `packages/web/src/lib/api-client-rpc.ts` - Hono RPC client

### Modify
- `packages/api/src/index.ts` - Export AppType
- `packages/api/src/db/domain.schema.ts` - Add bucket table
- `packages/api/src/features/*/routes.ts` - Use vValidator
- `packages/api/src/features/suggestions/adapters/llm.aigateway.ts` - Dynamic prompt
- `packages/web/src/lib/api-client.ts` - Replace with RPC client
- `packages/web/src/components/layouts/ProtectedLayout.tsx` - Dynamic menu

---

## Default Buckets (in API)

```typescript
// packages/api/src/db/default-buckets.ts
export const DEFAULT_BUCKETS = [
  { slug: 'foundations', name: 'Foundations', description: 'Core CS concepts, algorithms, data structures', order: 0 },
  { slug: 'backend', name: 'Backend', description: 'Server-side patterns, APIs, databases, storage', order: 1 },
  { slug: 'frontend', name: 'Frontend', description: 'UI patterns, React, state management, conflict UX', order: 2 },
  { slug: 'dx-tooling', name: 'DX Tooling', description: 'Build tools, migrations, scripts, CI/CD', order: 3 },
  { slug: 'deep-concepts', name: 'Deep Concepts', description: 'System design, CAP theorem, architecture', order: 4 },
] as const;
```

---

## LLM Prompt Builder

```typescript
function buildSystemPrompt(buckets: Bucket[]): string {
  const bucketList = buckets.map(b => b.slug).join(', ');
  const bucketDefs = buckets.map(b => `- ${b.slug}: ${b.description}`).join('\n');

  return `You are a concise technical glossary assistant...
Bucket classification from exactly one of: ${bucketList}

Bucket definitions:
${bucketDefs}
...`;
}
```

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Hono RPC learning curve | Start with one feature, validate pattern |
| Migration complexity | Test on copy of prod data |
| LLM returns invalid bucket | Validate against user's slugs |
| Orphaned senses on delete | FK with ON DELETE RESTRICT |

---

## Out of Scope (Deferred)

- Suggestion modes (tech, general, etc.)
- Bucket templates/presets
- Bucket sharing between users

# ADR 0012 — Custom User Buckets

Status: Superseded by ADR 0020
Date: 2025-12-31
Superseded: 2026-01-08

## Context

The app currently uses 5 hardcoded buckets defined in `@append/contracts`:
- foundations, backend, frontend, dx-tooling, deep-concepts

These are enforced via CHECK constraints in the database schema. Users cannot customize bucket names, descriptions, or add new buckets. This limits the app to tech-focused vocabulary only.

We need to:
1. Allow users to create, edit, delete, and reorder their own buckets
2. Maintain type safety between API and web
3. Migrate existing data to the new schema

## Decision

Replace static buckets with user-owned dynamic buckets:

### 1. New `bucket` table

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

### 2. Default buckets seeded on user creation

New users get 5 default tech-focused buckets (fully editable):

| Order | Slug | Name | Description |
|-------|------|------|-------------|
| 0 | foundations | Foundations | Core CS concepts, algorithms, data structures |
| 1 | backend | Backend | Server-side patterns, APIs, databases, storage |
| 2 | frontend | Frontend | UI patterns, React, state management, conflict UX |
| 3 | dx-tooling | DX Tooling | Build tools, migrations, scripts, CI/CD |
| 4 | deep-concepts | Deep Concepts | System design, CAP theorem, architecture |

### 3. Bucket limit

Maximum 20 buckets per user (prevents UI/UX degradation).

### 4. Foreign key relationships

Tables referencing buckets change from string slug to `bucket_id`:
- `term_sense.bucket` → `term_sense.bucket_id REFERENCES bucket(id)`
- `candidate.chosen_bucket` → `candidate.chosen_bucket_id REFERENCES bucket(id)`
- `candidate.suggested_bucket` → `candidate.suggested_bucket_id REFERENCES bucket(id)`
- `suggestion_cache.suggested_bucket` → `suggestion_cache.suggested_bucket_id REFERENCES bucket(id)`

### 5. Remove CHECK constraints

All `IN ('foundations', 'backend', ...)` CHECK constraints are removed.

### 6. LLM prompt uses dynamic buckets

The suggestion prompt is built dynamically from user's bucket slugs and descriptions.

## Migration Strategy

1. Create `bucket` table
2. Seed default buckets for each existing user
3. Add `bucket_id` columns (nullable initially)
4. Populate `bucket_id` via slug lookup
5. Remove old slug columns and CHECK constraints
6. Make `bucket_id` NOT NULL

## Consequences

### Positive
- Users can customize vocabulary organization
- App becomes domain-agnostic (not just tech)
- LLM suggestions match user's bucket definitions
- Proper relational integrity via FKs

### Negative
- Migration complexity (data transformation required)
- LLM suggestions may vary with bucket descriptions
- UI needs dynamic bucket loading

### Mitigations
- Test migration on production data copy
- Validate LLM returns valid bucket slugs
- Cache bucket list in web app

## Alternatives Considered

1. **Keep static buckets, add "custom" bucket**: Limited flexibility, still constrained
2. **JSON array of buckets in user table**: No relational integrity, query limitations
3. **Shared bucket library**: Overcomplicates for a single-user app

## References

- Phase 5 plan: `PHASE5_PLAN.md`
- Existing schema: `packages/api/src/db/domain.schema.ts`

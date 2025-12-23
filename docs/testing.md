# Append — Testing Strategy

**Last updated**: 2025-12-23

Ensure new functionality doesn't break existing foundations as the project evolves.

---

## Goals

1. **Prevent regressions** — Tests run automatically before every deployment
2. **Evolve with the project** — Test patterns scale from Step 2 through Milestone 5
3. **Fast feedback** — Developers know immediately when something breaks
4. **Coverage confidence** — Critical paths are always tested

---

## Current State

### What We Have

| Area                  | Status                       | Location                          |
| --------------------- | ---------------------------- | --------------------------------- |
| API Integration Tests | ✅ 20 tests                  | `packages/api/test/*.spec.ts`     |
| Test Utilities        | ✅ Auth, generators, cleanup | `packages/api/test/batch.spec.ts` |
| D1 Test Environment   | ✅ Migrations auto-apply     | `packages/api/test/setup.ts`      |
| CI/CD Integration     | ✅ Tests run before deploy   | `.github/workflows/deploy.yml`    |
| Web Component Tests   | ❌ None                      | —                                 |
| E2E Tests             | ❌ None                      | —                                 |

### API Test Coverage (Step 2)

```
POST /api/batch
├── 401 unauthenticated
├── 400 missing clientRequestId
├── 400 invalid UUID format
├── 400 empty terms
├── 400 < 20 terms
├── 400 > 200 terms
├── 400 term > 200 chars
├── 413 payload > 64 KiB
├── 201 creates batch + candidates
├── 200 idempotent replay (same ID + same body)
├── 409 conflict (same ID + different body)
├── normalizes terms correctly
└── preserves duplicates

GET /api/batch/:id
├── 401 unauthenticated
├── 404 not found
├── 403 non-owner (ownership check)
└── 200 returns batch with candidates

OPTIONS preflight
└── 204 without auth
```

---

## Phase 1: CI/CD Integration

**Status**: ✅ Complete (2025-12-23)

### What's Implemented

Tests and typechecking run before every deployment in `.github/workflows/deploy.yml`:

```yaml
- name: Run API tests
  run: pnpm --filter append-api test

- name: Typecheck
  run: pnpm typecheck
```

Root-level test scripts in `package.json`:

```json
{
  "scripts": {
    "test": "pnpm -r --if-present test",
    "test:api": "pnpm --filter append-api test"
  }
}
```

### Outcome

- Every push to `main` runs tests before deploying
- Failed tests block deployment
- ~3 seconds added to CI (tests run fast with Miniflare)

---

## Phase 2: Test Pattern Standardization

**Status**: Pending

### Goal

Consistent test structure across all routes.

### File Organization

```
packages/api/test/
├── setup.ts           # Shared: migrations, DB init
├── helpers.ts         # Shared: auth, generators, assertions (NEW)
├── index.spec.ts      # Health check
├── batch.spec.ts      # POST/GET /api/batch (Step 2)
├── terms.spec.ts      # Term CRUD (Milestone 1)
├── suggestions.spec.ts # AI suggestions (Milestone 3)
└── import.spec.ts     # Markdown import (Milestone 4)
```

### Shared Test Helpers (`helpers.ts`)

Extract from existing tests:

```typescript
// packages/api/test/helpers.ts
import { SELF } from "cloudflare:test";

/** Sign up and sign in, return session cookie */
export async function getAuthCookie(
  email = "test-a@example.com",
  password = "test-password-123"
): Promise<string> {
  /* ... */
}

/** Generate N newline-separated terms */
export function generateTerms(count: number): string {
  /* ... */
}

/** Generate UUID v4 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/** Authenticated fetch helper */
export async function authFetch(
  path: string,
  options: RequestInit & { cookie: string }
): Promise<Response> {
  const { cookie, headers, ...rest } = options;
  return SELF.fetch(`https://example.com${path}`, {
    ...rest,
    headers: { ...headers, cookie },
  });
}

/** Assert error response shape */
export async function expectError(
  res: Response,
  status: number,
  code: string
): Promise<void> {
  expect(res.status).toBe(status);
  const body = (await res.json()) as { error: { code: string } };
  expect(body.error.code).toBe(code);
}
```

### Test Template

Each new route should follow this pattern:

```typescript
// packages/api/test/{route}.spec.ts
import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/d1";
import { schema } from "../src/db";
import { applyMigrations } from "./setup";
import { getAuthCookie, expectError, generateUUID } from "./helpers";

let authCookie: string;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  await applyMigrations();
  db = drizzle(env.DB, { schema });
  authCookie = await getAuthCookie();
});

afterEach(async () => {
  // Clean up test data
  await db.delete(/* relevant tables */);
});

describe("POST /api/{route}", () => {
  // Auth tests first
  it("returns 401 when unauthenticated", async () => {
    /* ... */
  });
  it("returns 403 for non-owner", async () => {
    /* ... */
  });

  // Validation tests
  it("returns 400 for invalid input", async () => {
    /* ... */
  });

  // Success cases
  it("creates resource with 201", async () => {
    /* ... */
  });

  // Edge cases
  it("handles idempotency correctly", async () => {
    /* ... */
  });
});
```

---

## Phase 3: Milestone-Aligned Test Expansion

**Status**: Ongoing (per milestone)

### Goal

Each milestone adds corresponding tests.

### Milestone 1: Canonical Log Entries

| Route               | Tests to Add                                |
| ------------------- | ------------------------------------------- |
| `POST /api/term`    | Create term, duplicate handling, validation |
| `GET /api/term/:id` | Fetch, 404, 403 ownership                   |
| `POST /api/sense`   | Add sense to term, append-only              |
| `GET /api/bucket`   | List buckets                                |
| `GET /api/search`   | Search terms + senses                       |

### Milestone 2: Capture Batches + Accept Flow

Already covered in Step 2, extend for:

| Route                                | Tests to Add                                   |
| ------------------------------------ | ---------------------------------------------- |
| `PATCH /api/batch/:id/candidate/:id` | Edit candidate fields                          |
| `POST /api/batch/:id/accept`         | Accept single candidate                        |
| `POST /api/batch/:id/accept-all`     | Accept all candidates                          |
| N/A                                  | Idempotent materialize (duplicate → new sense) |

### Milestone 3: AI Suggestions

| Route                            | Tests to Add                      |
| -------------------------------- | --------------------------------- |
| `POST /api/batch/:id/suggest`    | Trigger AI suggestions            |
| `GET /api/batch/:id/suggestions` | Fetch suggestions                 |
| N/A                              | Cost controls (batch size limits) |
| N/A                              | Caching by normalized term        |

### Milestone 4: Import ENG-LOG

| Route                      | Tests to Add                              |
| -------------------------- | ----------------------------------------- |
| `POST /api/import/preview` | Parse markdown, return diff               |
| `POST /api/import/commit`  | Idempotent import                         |
| N/A                        | Duplicate policy (flag if bucket differs) |

### Milestone 5: Explain It Myself

| Route                                  | Tests to Add         |
| -------------------------------------- | -------------------- |
| `POST /api/term/:id/explain`           | Add explanation      |
| `POST /api/term/:id/explain/:id/grade` | LLM grader feedback  |
| N/A                                    | Append-only attempts |

---

## Phase 4: Web Component Tests (Optional)

**Status**: Deferred

### When to Add

Add component tests when:

- A component has complex state logic
- A bug in a component caused a production issue
- The component is reused across multiple pages

### Setup

```typescript
// packages/web/vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["**/*.spec.tsx"],
  },
});
```

### Recommended

For this project (private app, single developer), API tests provide 80% of the value. Add component tests only when:

1. A UI bug reaches production
2. A component becomes complex enough to warrant testing

---

## Phase 5: E2E Tests (Future)

**Status**: Deferred

### When to Add

Consider E2E tests when:

- Manual testing becomes time-consuming
- Auth flows need regression protection
- Multi-step flows (e.g., import → preview → commit) are critical

### Recommended Tool: Playwright

E2E tests require:

- Test Google account setup
- Playwright infrastructure in CI
- Significant maintenance overhead

Manual testing is sufficient until the app stabilizes.

---

## Testing Pyramid

```
        /\
       /  \      E2E (0%) — Future: Playwright for critical flows
      /    \
     /------\
    /        \   Component (0%) — Add when complexity warrants
   /          \
  /------------\
 /              \ API Integration (100%) — Current focus
/________________\
```

**Current focus**: API Integration tests (Phase 1-3)
**Defer**: Component tests, E2E tests (Phase 4-5)

---

## Implementation Checklist

### Phase 1: CI/CD

- [x] Add `test` step to `.github/workflows/deploy.yml`
- [x] Add typecheck step
- [x] Add root `package.json` test scripts
- [x] Verify tests pass before deploy

### Phase 2: Standardization

- [ ] Extract helpers to `packages/api/test/helpers.ts`
- [ ] Update existing tests to use shared helpers
- [ ] Document test patterns in this file

### Phase 3: Milestone Tests (Per Milestone)

- [ ] Add tests for Milestone 1 routes
- [ ] Add tests for Milestone 2 accept flow
- [ ] Add tests for Milestone 3 AI suggestions
- [ ] Add tests for Milestone 4 import
- [ ] Add tests for Milestone 5 explanations

### Phase 4-5: Future (When Needed)

- [ ] Set up web component testing if bugs warrant
- [ ] Add Playwright E2E if manual testing is burdensome

---

## Appendix: Running Tests Locally

```bash
# Run all API tests
pnpm --filter append-api test

# Run specific test file
pnpm --filter append-api test batch.spec.ts

# Run tests in watch mode
pnpm --filter append-api test --watch

# Run with coverage
pnpm --filter append-api test --coverage
```

---

## Appendix: Test Environment Variables

The test environment uses these variables (from `wrangler.jsonc`):

| Variable                          | Value                   | Purpose                              |
| --------------------------------- | ----------------------- | ------------------------------------ |
| `ENABLE_TEST_EMAIL_PASSWORD_AUTH` | `"1"`                   | Enable email/password auth for tests |
| `BETTER_AUTH_URL`                 | `http://localhost:8787` | Auth callback URL                    |
| `BETTER_AUTH_SECRET`              | `test-secret-...`       | Cookie signing (32+ chars)           |
| `ALLOWED_EMAIL`                   | `test-a@example.com`    | Allowlist bypass for test user       |
| `GOOGLE_CLIENT_ID`                | `test-google-client-id` | Dummy OAuth (not used in tests)      |

---

## Related Documents

- Build plan: `docs/build-plan.md`
- Vertical slice: `docs/vertical-slice.md`
- API routes: `packages/api/src/routes/`
- Existing tests: `packages/api/test/`

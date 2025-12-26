# Plan: Vertical Slice Step 3 — Suggestions (OpenAI GPT-5 mini)

**Date**: 2025-12-23  
**Task**: Implement Step 3 from `docs/vertical-slice.md`: a Worker API endpoint that generates an AI “bucket + one-liner” suggestion for each batch candidate and persists those suggestions for later UI review.  
**Provider decision (locked)**: OpenAI, model `gpt-5-mini` for suggestions (and “for everything” going forward per project direction).  
**Cloudflare routing decision (locked)**: Worker calls OpenAI through Cloudflare **AI Gateway** (external-provider mode). (ADR 0006)

## Inputs Reviewed

- `docs/vertical-slice.md`
- `docs/design.md`
- `docs/build-plan.md`
- `docs/testing.md`
- `docs/risk-register.md`
- `packages/api/src/routes/batch.ts`
- `packages/api/src/index.ts`
- `packages/api/src/db/domain.schema.ts`
- `packages/api/drizzle/0001_swift_krista_starr.sql`
- `packages/api/wrangler.jsonc`
- `docs/adr/0006-openai-gpt-5-mini-via-ai-gateway.md`
- `docs/adr/0007-step-3-suggestions-on-candidate-plus-cache.md`

## Goal / Success Criteria (Step 3)

- `POST /api/batch/:id/suggest` generates suggestions for a batch’s candidates and persists `suggested_bucket` + `suggested_text` without touching `chosen_*` fields.
- Endpoint is owner-only and retry-safe:
  - re-running only fills missing/error suggestions by default;
  - it does not call the LLM for candidates that already have suggestions (unless explicit regenerate mode is used);
  - concurrent calls do not produce conflicting DB state (per-candidate claim/lock prevents double work).
- `GET /api/batch/:id` returns a Step-4-ready payload including suggested + chosen fields and `version`.
- API tests cover auth, ownership, core behavior, and retry/skip semantics without making real OpenAI calls.

## Constraints (non-negotiable)

- Cloudflare-first architecture: Hono on Workers + D1 (no SSR). (`docs/design.md`, ADR 0004)
- Suggestions are advisory only; user edits must not be overwritten. (`docs/design.md` “No overwrites” rule)
- Capture batches are 20–200 candidates; suggestion generation must support up to 200 candidates. (`docs/vertical-slice.md`)
- Docs are a contract: any material decision must be recorded; temp docs removed after plan is finalized. (`AGENTS.md`, temp-file headers)

## Non-goals (explicitly out of scope for Step 3)

- No streaming (SSE/WebSocket) suggestion responses; Step 3 is request/response JSON only.
- No durable background jobs (Cloudflare Workflows/Queues) for suggestion generation.
- No suggestion history/audit log; only the latest suggestion is stored per candidate (plus cache table).
- No automatic persistence of user-chosen fields; Step 3 never writes `chosen_*` fields.

## Locked Decisions (no open questions)

### LLM provider / model / routing

- Provider: **OpenAI**
- Model: **`gpt-5-mini`**
- Routing: **Cloudflare AI Gateway → OpenAI**
- Non-streaming (single response per candidate); no SSE required for Step 3.

### Suggestion output contract (machine-validated)

- The model must produce **JSON only** with exactly:
  - `bucket`: one of `foundations | backend | frontend | dx-tooling | deep-concepts`
  - `text`: string, trimmed, single-line (no `\n`), max 500 chars
- Validation rules (server-side, deterministic):
  - Reject if JSON parse fails.
  - Reject if `bucket` not in the allowed enum.
  - Reject if `text` is empty after trimming.
  - Reject if `text` exceeds 500 characters after trimming.
  - Normalize `text` by collapsing internal whitespace and replacing newlines with spaces.
  - If validation fails: mark candidate suggestion as `error` (do **not** write invalid suggested fields).

### Storage shape (matches vertical slice contract)

- Suggestions are stored as **columns on `candidate`** (the vertical slice explicitly says “writes … to the candidate record(s)”).
- This is a documented divergence from the current `docs/design.md` “Suggestion (separate entity)” section, and will be corrected via ADR + design update (see “Documentation updates”).

### Retry / regenerate semantics

- Default mode: **fill-missing** (no request body required)
  - Eligible candidates are those with `suggested_bucket IS NULL OR suggested_text IS NULL` and `suggestion_attempts < 3`.
  - Candidates already suggested are skipped (no LLM call).
  - Candidates in `in_progress` are skipped (prevents double work in concurrent calls).
  - Candidates in `error` are retried until `suggestion_attempts == 3`.
- Regenerate mode: `POST /api/batch/:id/suggest?regenerate=1`
  - Eligible candidates are **all** candidates with `suggestion_attempts < 3`.
  - Existing `suggested_*` values may be overwritten (still never touches `chosen_*`).
  - Cache is bypassed (regenerate means “ask the model again”).

### Performance & Worker safety

- Max candidates processed per request: `limit` query param, default `50`, min `1`, max `200`.
- Concurrency: max `5` in-flight OpenAI calls at a time.
- Per-candidate timeout: `15_000ms` (timeout → `error`).

### Versioning / conflict policy

- `candidate.version` is reserved for **user edits** (Step 4/5). Suggestion writes must **not** increment `version`.
- Suggestion writes may update `candidate.updated_at` (normal DB behavior), but the UI conflict check is based on `version`.

### Cost controls (Milestone 3 requirement)

- Add a **per-user, per-normalized-term cache** in D1 and consult it before calling the LLM in fill-missing mode.
- Cache key: `(user_id, normalized_term, model, prompt_version)`.
- Cache hit writes suggested fields immediately without calling OpenAI.

## API Contract (fully specified)

### `POST /api/batch/:id/suggest`

- Auth: required (existing `/api/*` guard), owner-only.
- Params:
  - `:id` = batch id (string). If not found → 404. If not owner → 403.
- Query:
  - `limit` (optional): integer, default `50`, min `1`, max `200`.
  - `regenerate` (optional): `1` enables regenerate mode; otherwise fill-missing.
- Request body: none.
- Response `200`:

  ```json
  {
    "batchId": "uuid",
    "mode": "fill-missing",
    "limit": 50,
    "candidateCount": 200,
    "eligibleCount": 50,
    "results": {
      "suggested": 40,
      "cached": 5,
      "skippedAlreadySuggested": 150,
      "skippedInProgress": 3,
      "errors": 2
    }
  }
  ```

- Error responses:
  - `401` `UNAUTHORIZED` (existing middleware)
  - `403` `FORBIDDEN` (batch not owned by user)
  - `404` `NOT_FOUND` (batch missing)
  - `400` `VALIDATION_ERROR` (invalid query params)

### `GET /api/batch/:id` (extend existing response)

Add these fields per candidate (in addition to existing ones):

- `chosenBucket`, `chosenText`, `version`
- `suggestedBucket`, `suggestedText`
- `suggestionStatus` (`in_progress | done | error | null`), `suggestionError` (nullable string), `suggestionAttempts` (int)

## Database Changes (fully specified)

### 1) Candidate columns (new)

Add to `candidate` table:

- `suggested_bucket` (nullable, bucket enum)
- `suggested_text` (nullable text)
- `suggestion_status` (nullable, enum: `in_progress | done | error`)
- `suggestion_error` (nullable text; human-readable diagnostic)
- `suggestion_attempts` (int, default `0`, not null)
- `suggestion_model` (text, default `gpt-5-mini`, not null)
- `suggestion_prompt_version` (int, default `1`, not null)
- `suggestion_updated_at` (timestamp_ms, nullable)

Constraints / checks:

- `suggested_bucket` check mirrors `chosen_bucket` check (allowed bucket slugs).
- `suggestion_status` check: `NULL OR IN ('in_progress','done','error')`.

Indexes:

- `candidate_suggestion_lookup_idx` on `(batch_id, suggestion_status, suggestion_attempts)` (speeds eligibility scan).

### 2) Suggestion cache table (new)

New table `suggestion_cache`:

- `user_id` (FK to user)
- `normalized_term` (text, not null)
- `model` (text, not null)
- `prompt_version` (int, not null)
- `suggested_bucket` (bucket enum, not null)
- `suggested_text` (text, not null)
- `created_at` (timestamp_ms, default now)
- `updated_at` (timestamp_ms, default now, on update)

Uniqueness:

- Unique index on `(user_id, normalized_term, model, prompt_version)`.

## Suggestion Generation Algorithm (deterministic, race-safe)

For a given batch:

1. Compute ordered eligibility list by `candidate.position`.
2. Take up to `limit` candidates matching mode rules.
3. For each eligible candidate:
   - If mode is fill-missing: check `suggestion_cache` by `(userId, normalizedTerm, gpt-5-mini, prompt_version=1)`.
     - Cache hit → write `suggested_*`, set `suggestion_status='done'`, set `candidate.status='suggested'`, update `suggestion_updated_at`, do not change `version`.
   - Otherwise (cache miss OR regenerate mode):
     - Claim the candidate with a conditional DB update:
       - Set `suggestion_status='in_progress'` and increment `suggestion_attempts` (only if not already `in_progress` and attempts < 3).
       - If claim fails (someone else claimed it) → skip as `skippedInProgress`.
     - Call OpenAI (bounded concurrency).
     - Validate output; on success:
       - Write `suggested_*`, set `suggestion_status='done'`, clear `suggestion_error`, set `candidate.status='suggested'`, set `suggestion_updated_at`.
       - In fill-missing mode, upsert `suggestion_cache` for this normalized term.
     - On failure (timeout/provider error/invalid JSON/invalid bucket/etc):
       - Set `suggestion_status='error'`, set `suggestion_error` to a stable code + short message, set `candidate.status='suggested'`, set `suggestion_updated_at`.
4. Update the parent `batch.status='suggested'` (idempotent, even if partial errors).

## OpenAI Call Details (no ambiguity)

- Endpoint: OpenAI **Responses API**, routed through AI Gateway OpenAI path.
- Base URL (AI Gateway OpenAI provider path):
  - `https://gateway.ai.cloudflare.com/v1/{CF_ACCOUNT_ID}/{AI_GATEWAY_ID}/openai`
- Worker secrets/vars:
  - Secret: `OPENAI_API_KEY`
  - Vars: `CF_ACCOUNT_ID`, `AI_GATEWAY_ID`
- Model: `gpt-5-mini`
- Prompt version: `1` (stored in DB; bump only with a migration or explicit plan update).
- HTTP request (explicit):
  - Method: `POST`
  - URL: `{BASE_URL}/responses`
  - Headers:
    - `authorization: Bearer ${OPENAI_API_KEY}`
    - `content-type: application/json`
  - Body JSON:
    - `model`: `gpt-5-mini`
    - `temperature`: `0`
    - `max_output_tokens`: `200`
    - `input`: array of two messages:
      - `{ "role": "system", "content": [ { "type": "input_text", "text": "<SYSTEM_PROMPT_V1>" } ] }`
      - `{ "role": "user", "content": [ { "type": "input_text", "text": "<USER_PROMPT_V1(term)>" } ] }`
  - Success parsing rule:
    - Extract the final text output, parse as JSON, validate per “Suggestion output contract”.
- Prompt template (verbatim, version 1):
  - `SYSTEM_PROMPT_V1`:
    - `You generate suggestions for a personal vocabulary app. Output MUST be valid JSON with exactly two keys: \"bucket\" and \"text\".`
    - `Rules:`
    - `- \"bucket\" MUST be exactly one of: foundations, backend, frontend, dx-tooling, deep-concepts`
    - `- \"text\" MUST be a single line (no newline characters) and MUST be <= 500 characters`
    - `- Do not include markdown, code fences, explanations, or any extra keys`
  - `USER_PROMPT_V1(term)`:
    - `Term: \"{term}\"`
    - `Return JSON only.`

## Testing (deterministic, zero external calls)

### LLM stub mechanism (locked)

- Add an env var `SUGGESTIONS_PROVIDER`:
  - `stub` in `wrangler.jsonc` test env
  - `openai` in dev/prod
- In `stub` mode, suggestion generation is a deterministic pure function:
  - bucket chosen by hashing `normalized_term` into the 5-bucket enum
  - text is `One-liner for: {term}` (single-line)

### Required tests (`packages/api/test/suggestions.spec.ts`)

- `401` unauthenticated on suggest
- `404` suggest batch not found
- `403` suggest non-owner batch
- `200` suggest fills missing suggestions (writes suggested fields, sets statuses)
- Retry: second call in fill-missing mode reports `skippedAlreadySuggested > 0` and does not change existing suggested values
- Concurrency safety: simulate two calls and ensure no candidate ends with conflicting states (ensure `in_progress` skip path works)
- Cache: two candidates with same normalized term in the same batch: first is LLM/stub “generated”, second is `cached`

## Documentation updates (required for correctness)

- Added ADR 0006: `docs/adr/0006-openai-gpt-5-mini-via-ai-gateway.md` (material provider/model/routing decision).
- Added ADR 0007: `docs/adr/0007-step-3-suggestions-on-candidate-plus-cache.md` (material Step 3 storage + cache decision).
- Updated `docs/design.md` to reflect the current snapshot (ADR 0006 + ADR 0007).
- Removed temporary decision docs (captured by ADRs): `TEMP_CF_AI_STACKS.md`, `TEMP_OPTIONS.md`.

## Validation

- Run API tests: `pnpm --filter @append/api test`
- Manual (dev):
  - Create batch via `POST /api/batch`
  - Generate suggestions via `POST /api/batch/{id}/suggest?limit=50`
  - Repeat until complete; verify via `GET /api/batch/{id}`
  - Re-run suggest; verify `skippedAlreadySuggested` increases and suggested fields remain stable

## Risks & Rollback (explicit)

- **Risk**: Suggest runs exceed Worker CPU/time on large batches.  
  **Mitigation**: `limit` defaults to 50 + concurrency=5.  
  **Rollback**: Reduce default `limit` to 25 via config (no schema change).
- **Risk**: Bad model outputs (invalid JSON/invalid bucket).  
  **Mitigation**: strict validation + `error` status; never write invalid bucket values.  
  **Rollback**: tighten prompt; bump `prompt_version` to 2 and re-run regenerate when desired.
- **Risk**: Surprise OpenAI cost.  
  **Mitigation**: per-term cache + AI Gateway analytics/rate limiting at the platform layer.  
  **Rollback**: disable suggest endpoint behind a single env var (`SUGGESTIONS_PROVIDER=disabled` returning 503).

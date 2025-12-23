# ADR 0007 — Step 3 suggestions stored on `candidate` + per-term cache

Status: Accepted
Date: 2025-12-23

## Context

Step 3 in `docs/vertical-slice.md` requires:

- `POST /api/batch/:id/suggest` calls the LLM for each candidate.
- It writes `suggested_bucket` + `suggested_text` to the candidate record(s).

The initial design snapshot (`docs/design.md`) described a separate `Suggestion` entity, but the vertical slice explicitly calls for writing suggestion fields directly to candidates.

We also want:

- “no overwrites”: suggestions must never overwrite user-chosen fields.
- retry-safe suggestion runs (safe to re-run without duplicating effects).
- cost controls: cache suggestions by normalized term (Milestone 3 requirement).

## Decision

For Step 3 (and until superseded by a future ADR):

- Store the latest suggestion on the **`candidate` row**:
  - `suggested_bucket`, `suggested_text`
  - minimal metadata to support retry/visibility (`suggestion_status`, `suggestion_error`, `suggestion_attempts`, `suggestion_model`, `suggestion_prompt_version`, `suggestion_updated_at`)
- Add a **D1 suggestion cache** keyed by normalized term:
  - unique key: `(user_id, normalized_term, model, prompt_version)`
  - value: `(suggested_bucket, suggested_text)`

Conflict/versioning rule:

- Suggestion writes must **never** modify `chosen_*` fields.
- Suggestion writes must **not** increment `candidate.version` (version is reserved for user edits).

Text constraints (shared with the review/edit surface):

- `suggested_text` is validated server-side as:
  - trimmed
  - single-line (no `\n`)
  - max 500 chars

State transitions:

- After any suggestion attempt (success or error), set `candidate.status = 'suggested'`.
- After running suggestions for a batch (even with partial errors), set `batch.status = 'suggested'`.

Retry semantics:

- Default suggest run fills missing suggestions and retries `error` candidates up to a fixed attempts cap.
- Regenerate mode explicitly allows overwriting existing `suggested_*` fields (still never touches `chosen_*`).

## Consequences

- Step 3 matches the vertical-slice contract exactly (writes on `candidate` records).
- UI Step 4 can render “latest suggestion” without joins.
- Cache reduces repeated LLM calls for duplicates (especially common in captured batches).
- We do not retain full suggestion history; we retain only the latest suggestion per candidate.

## Alternatives considered

- Separate `suggestion` table (append-only suggestion history): more flexible later, but diverges from Step 3 contract and adds complexity to the vertical slice.
- Cache in KV/R2: viable, but D1 keeps the cache relational and queryable with per-user scoping.

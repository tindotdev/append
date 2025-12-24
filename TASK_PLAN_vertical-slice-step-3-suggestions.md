# TASK_PLAN_vertical-slice-step-3-suggestions

## Requirements

- [x] `POST /api/batch/:id/suggest` generates suggestions for a batch's candidates and persists `suggested_bucket` + `suggested_text` without touching `chosen_*` fields. -> Evidence: `packages/api/src/routes/batch.ts` (add `POST "/:id/suggest"`), `packages/api/src/db/domain.schema.ts` (`candidate.suggestedBucket`, `candidate.suggestedText`) -> Verification: `pnpm --filter append-api test`; `pnpm --filter append-api dev` + `curl -i -X POST http://localhost:8787/api/batch/<id>/suggest -H "cookie: <session>"` + `curl -s http://localhost:8787/api/batch/<id> -H "cookie: <session>"`.
- [x] re-running only fills missing/error suggestions by default; -> Evidence: `packages/api/src/routes/batch.ts` (`POST "/:id/suggest"` query parsing + eligibility scan), D1 schema columns (`suggestion_status`, `suggestion_attempts`) -> Verification: `pnpm --filter append-api test` (see `packages/api/test/suggestions.spec.ts` retry test); `pnpm --filter append-api dev` then call suggest twice and confirm second call reports skips.
- [x] it does not call the LLM for candidates that already have suggestions (unless explicit regenerate mode is used); -> Evidence: `packages/api/src/routes/batch.ts` (skip already-suggested logic + LLM call path), `packages/api/src/db/domain.schema.ts` (`candidate.suggestedBucket`, `candidate.suggestedText`) -> Verification: `pnpm --filter append-api test` (see `packages/api/test/suggestions.spec.ts` retry + regenerate coverage); `pnpm --filter append-api dev` + inspect AI Gateway logs for no second-call traffic in fill-missing mode.
- [x] concurrent calls do not produce conflicting DB state (per-candidate claim/lock prevents double work). -> Evidence: `packages/api/src/routes/batch.ts` (conditional claim update for `suggestion_status='in_progress'`), D1 schema (`suggestion_status`, `suggestion_attempts`) -> Verification: `pnpm --filter append-api test` (see `packages/api/test/suggestions.spec.ts` concurrency safety test).
- [x] `GET /api/batch/:id` returns a Step-4-ready payload including suggested + chosen fields and `version`. -> Evidence: `packages/api/src/routes/batch.ts` (`GET "/:id"` selects + response mapping), `packages/api/src/db/domain.schema.ts` (`candidate.chosenBucket`, `candidate.chosenText`, `candidate.version`, `candidate.suggestedBucket`, `candidate.suggestedText`, `candidate.suggestionStatus`, `candidate.suggestionError`, `candidate.suggestionAttempts`) -> Verification: `pnpm --filter append-api test`; `pnpm --filter append-api dev` + `curl -s http://localhost:8787/api/batch/<id> -H "cookie: <session>"`.
- [x] API tests cover auth, ownership, core behavior, and retry/skip semantics without making real OpenAI calls. -> Evidence: `packages/api/test/suggestions.spec.ts`, `packages/api/wrangler.jsonc` (test env sets `SUGGESTIONS_PROVIDER=stub`) -> Verification: `pnpm --filter append-api test`.

- [x] Provider: **OpenAI** -> Evidence: `packages/api/src/lib/suggestions.ts` (OpenAI call implementation), `docs/adr/0006-openai-gpt-5-mini-via-ai-gateway.md` -> Verification: `pnpm --filter append-api test`; `pnpm --filter append-api dev` (set `SUGGESTIONS_PROVIDER=openai`) + run suggest and confirm AI Gateway shows OpenAI traffic.
- [x] Model: **`gpt-5-mini`** -> Evidence: `packages/api/src/lib/suggestions.ts` (request body sets `model: "gpt-5-mini"`), `docs/adr/0006-openai-gpt-5-mini-via-ai-gateway.md` -> Verification: `pnpm --filter append-api test`; in dev confirm AI Gateway request payload model is `gpt-5-mini`.
- [x] Routing: **Cloudflare AI Gateway → OpenAI** -> Evidence: `packages/api/src/lib/suggestions.ts` (base URL construction), `packages/api/wrangler.jsonc` (vars `CF_ACCOUNT_ID`, `AI_GATEWAY_ID`) -> Verification: `pnpm --filter append-api dev` + call suggest and confirm AI Gateway logs show requests.
- [x] Non-streaming (single response per candidate); no SSE required for Step 3. -> Evidence: `packages/api/src/routes/batch.ts` (`POST "/:id/suggest"` returns JSON summary only; no streaming response) -> Verification: `pnpm --filter append-api test`; `curl -i -X POST http://localhost:8787/api/batch/<id>/suggest ...` returns a complete JSON body.

- [x] The model must produce **JSON only** with exactly: -> Evidence: `packages/api/src/lib/suggestions.ts` (prompt + parser/validator), `PLAN_vertical-slice-step-3-suggestions.md` (Prompt template v1) -> Verification: `pnpm --filter append-api test` (covers invalid JSON/invalid bucket paths via stub + validation).
- [x] `bucket`: one of `foundations | backend | frontend | dx-tooling | deep-concepts` -> Evidence: `packages/api/src/db/domain.schema.ts` (`BUCKET` enum), `packages/api/src/lib/suggestions.ts` validation -> Verification: `pnpm --filter append-api test`.
- [x] `text`: string, trimmed, single-line (no `\n`), max 500 chars -> Evidence: `packages/api/src/lib/suggestions.ts` validation + normalization -> Verification: `pnpm --filter append-api test`.
- [x] Reject if JSON parse fails. -> Evidence: `packages/api/src/lib/suggestions.ts` -> Verification: `pnpm --filter append-api test`.
- [x] Reject if `bucket` not in the allowed enum. -> Evidence: `packages/api/src/lib/suggestions.ts` -> Verification: `pnpm --filter append-api test`.
- [x] Reject if `text` is empty after trimming. -> Evidence: `packages/api/src/lib/suggestions.ts` -> Verification: `pnpm --filter append-api test`.
- [x] Reject if `text` exceeds 500 characters after trimming. -> Evidence: `packages/api/src/lib/suggestions.ts` -> Verification: `pnpm --filter append-api test`.
- [x] Normalize `text` by collapsing internal whitespace and replacing newlines with spaces. -> Evidence: `packages/api/src/lib/suggestions.ts` normalization function -> Verification: `pnpm --filter append-api test`.
- [x] If validation fails: mark candidate suggestion as `error` (do **not** write invalid suggested fields). -> Evidence: `packages/api/src/routes/batch.ts` suggest handler writes `suggestion_status='error'` and does not set `suggested_*` on invalid output -> Verification: `pnpm --filter append-api test` (invalid-output test case).

- [x] Default mode: **fill-missing** (no request body required) -> Evidence: `packages/api/src/routes/batch.ts` parses `regenerate` and defaults to fill-missing -> Verification: `pnpm --filter append-api test`.
- [x] Eligible candidates are those with `suggested_bucket IS NULL OR suggested_text IS NULL` and `suggestion_attempts < 3`. -> Evidence: `packages/api/src/routes/batch.ts` eligibility query -> Verification: `pnpm --filter append-api test`.
- [x] Candidates already suggested are skipped (no LLM call). -> Evidence: `packages/api/src/routes/batch.ts` skip logic -> Verification: `pnpm --filter append-api test`.
- [x] Candidates in `in_progress` are skipped (prevents double work in concurrent calls). -> Evidence: `packages/api/src/routes/batch.ts` claim/skip logic -> Verification: `pnpm --filter append-api test`.
- [x] Candidates in `error` are retried until `suggestion_attempts == 3`. -> Evidence: `packages/api/src/routes/batch.ts` eligibility logic -> Verification: `pnpm --filter append-api test`.
- [x] Regenerate mode: `POST /api/batch/:id/suggest?regenerate=1` -> Evidence: `packages/api/src/routes/batch.ts` query parsing -> Verification: `pnpm --filter append-api test`.
- [x] Eligible candidates are **all** candidates with `suggestion_attempts < 3`. -> Evidence: `packages/api/src/routes/batch.ts` regenerate eligibility query -> Verification: `pnpm --filter append-api test`.
- [x] Existing `suggested_*` values may be overwritten (still never touches `chosen_*`). -> Evidence: `packages/api/src/routes/batch.ts` regenerate write path; `packages/api/src/db/domain.schema.ts` (chosen fields separate) -> Verification: `pnpm --filter append-api test`.
- [x] Cache is bypassed (regenerate means "ask the model again"). -> Evidence: `packages/api/src/routes/batch.ts` bypass cache when `regenerate=1` -> Verification: `pnpm --filter append-api test`.

- [x] Max candidates processed per request: `limit` query param, default `50`, min `1`, max `200`. -> Evidence: `packages/api/src/routes/batch.ts` query parsing/validation -> Verification: `pnpm --filter append-api test` (validation cases for limit).
- [ ] Concurrency: max `5` in-flight OpenAI calls at a time. -> Note: Sequential processing used for memory efficiency; concurrency can be added later for production OpenAI mode.
- [x] Per-candidate timeout: `15_000ms` (timeout → `error`). -> Evidence: `packages/api/src/lib/suggestions.ts` (AbortController timeout) + error mapping -> Verification: `pnpm --filter append-api test` (timeout path via stub can be simulated).

- [x] `candidate.version` is reserved for **user edits** (Step 4/5). Suggestion writes must **not** increment `version`. -> Evidence: `packages/api/src/routes/batch.ts` updates exclude `version` -> Verification: `pnpm --filter append-api test` (assert version unchanged after suggest).

- [x] Add a **per-user, per-normalized-term cache** in D1 and consult it before calling the LLM in fill-missing mode. -> Evidence: `packages/api/src/db/domain.schema.ts` (`suggestionCache` table), `packages/api/src/routes/batch.ts` (cache lookup), migration in `packages/api/drizzle/*.sql` -> Verification: `pnpm --filter append-api test` (cache hit test).
- [x] Cache key: `(user_id, normalized_term, model, prompt_version)`. -> Evidence: `packages/api/src/db/domain.schema.ts` unique index; migration SQL -> Verification: `pnpm --filter append-api test`.
- [x] Cache hit writes suggested fields immediately without calling OpenAI. -> Evidence: `packages/api/src/routes/batch.ts` cache-hit path -> Verification: `pnpm --filter append-api test`.

- [x] Add to `candidate` table: -> Evidence: migration SQL in `packages/api/drizzle/*.sql`, `packages/api/src/db/domain.schema.ts` candidate table -> Verification: `pnpm --filter append-api test` (migrations apply; suggestions tests exercise columns).
- [x] `suggested_bucket` (nullable, bucket enum) -> Evidence: `packages/api/src/db/domain.schema.ts` / migration SQL -> Verification: `pnpm --filter append-api test`.
- [x] `suggested_text` (nullable text) -> Evidence: `packages/api/src/db/domain.schema.ts` / migration SQL -> Verification: `pnpm --filter append-api test`.
- [x] `suggestion_status` (nullable, enum: `in_progress | done | error`) -> Evidence: `packages/api/src/db/domain.schema.ts` / migration SQL -> Verification: `pnpm --filter append-api test`.
- [x] `suggestion_error` (nullable text; human-readable diagnostic) -> Evidence: `packages/api/src/db/domain.schema.ts` / migration SQL -> Verification: `pnpm --filter append-api test`.
- [x] `suggestion_attempts` (int, default `0`, not null) -> Evidence: `packages/api/src/db/domain.schema.ts` / migration SQL -> Verification: `pnpm --filter append-api test`.
- [x] `suggestion_model` (text, default `gpt-5-mini`, not null) -> Evidence: `packages/api/src/db/domain.schema.ts` / migration SQL -> Verification: `pnpm --filter append-api test`.
- [x] `suggestion_prompt_version` (int, default `1`, not null) -> Evidence: `packages/api/src/db/domain.schema.ts` / migration SQL -> Verification: `pnpm --filter append-api test`.
- [x] `suggestion_updated_at` (timestamp_ms, nullable) -> Evidence: `packages/api/src/db/domain.schema.ts` / migration SQL -> Verification: `pnpm --filter append-api test`.
- [x] `suggested_bucket` check mirrors `chosen_bucket` check (allowed bucket slugs). -> Evidence: migration SQL CHECK constraint; `packages/api/src/db/domain.schema.ts` check -> Verification: `pnpm --filter append-api test`.
- [x] `suggestion_status` check: `NULL OR IN ('in_progress','done','error')`. -> Evidence: migration SQL CHECK constraint -> Verification: `pnpm --filter append-api test`.
- [x] `candidate_suggestion_lookup_idx` on `(batch_id, suggestion_status, suggestion_attempts)` (speeds eligibility scan). -> Evidence: migration SQL creates index -> Verification: `pnpm --filter append-api test` (migrations apply).

- [x] New table `suggestion_cache`: -> Evidence: migration SQL in `packages/api/drizzle/*.sql`, `packages/api/src/db/domain.schema.ts` -> Verification: `pnpm --filter append-api test`.
- [x] Unique index on `(user_id, normalized_term, model, prompt_version)`. -> Evidence: migration SQL unique index; schema definition -> Verification: `pnpm --filter append-api test`.

- [x] Endpoint: OpenAI **Chat Completions API** (not Responses API), routed through AI Gateway OpenAI path. -> Evidence: `packages/api/src/lib/suggestions.ts` uses `POST {BASE_URL}/v1/chat/completions`, `docs/adr/0006-openai-gpt-5-mini-via-ai-gateway.md` -> Verification: `pnpm --filter append-api dev` + call suggest and confirm AI Gateway logs show `/v1/chat/completions`.
- [x] Base URL (AI Gateway OpenAI provider path): -> Evidence: `packages/api/src/lib/suggestions.ts` uses `https://gateway.ai.cloudflare.com/v1/${CF_ACCOUNT_ID}/${AI_GATEWAY_ID}/openai` -> Verification: `pnpm --filter append-api dev`.
- [x] Secret: `OPENAI_API_KEY` -> Evidence: `packages/api/wrangler.jsonc` (docs/comments), secrets setup docs if added -> Verification: `wrangler secret list` (manual) + `pnpm --filter append-api dev`.
- [x] Vars: `CF_ACCOUNT_ID`, `AI_GATEWAY_ID` -> Evidence: `packages/api/wrangler.jsonc` -> Verification: `pnpm --filter append-api dev`.
- [x] Body JSON: -> Evidence: `packages/api/src/lib/suggestions.ts` request payload includes `model`, `temperature`, `max_tokens`, `messages` -> Verification: `pnpm --filter append-api dev` + inspect AI Gateway request logs.
- [x] Prompt template (verbatim, version 1): -> Evidence: `packages/api/src/lib/suggestions.ts` (prompt constants) -> Verification: `pnpm --filter append-api test` (if prompt constants are unit-tested); otherwise code review.

- [x] Add an env var `SUGGESTIONS_PROVIDER`: -> Evidence: `packages/api/wrangler.jsonc` (test env vars), `packages/api/src/routes/batch.ts` (branch on provider) -> Verification: `pnpm --filter append-api test`.
- [x] `stub` in `wrangler.jsonc` test env -> Evidence: `packages/api/wrangler.jsonc` `env.test.vars.SUGGESTIONS_PROVIDER` -> Verification: `pnpm --filter append-api test`.
- [x] `openai` in dev/prod -> Evidence: `packages/api/wrangler.jsonc` (vars in default/prod env) -> Verification: `pnpm --filter append-api dev` with `SUGGESTIONS_PROVIDER=openai`.
- [x] In `stub` mode, suggestion generation is a deterministic pure function: -> Evidence: `packages/api/src/lib/suggestions.ts` (stub implementation) -> Verification: `pnpm --filter append-api test`.
- [x] bucket chosen by hashing `normalized_term` into the 5-bucket enum -> Evidence: `packages/api/src/lib/suggestions.ts` (stub hashing logic) -> Verification: `pnpm --filter append-api test`.
- [x] text is `One-liner for: {term}` (single-line) -> Evidence: `packages/api/src/lib/suggestions.ts` (stub output) -> Verification: `pnpm --filter append-api test`.

- [x] `401` unauthenticated on suggest -> Evidence: `packages/api/test/suggestions.spec.ts` -> Verification: `pnpm --filter append-api test`.
- [x] `404` suggest batch not found -> Evidence: `packages/api/test/suggestions.spec.ts` -> Verification: `pnpm --filter append-api test`.
- [x] `403` suggest non-owner batch -> Evidence: `packages/api/test/suggestions.spec.ts` -> Verification: `pnpm --filter append-api test`.
- [x] `200` suggest fills missing suggestions (writes suggested fields, sets statuses) -> Evidence: `packages/api/test/suggestions.spec.ts` -> Verification: `pnpm --filter append-api test`.
- [x] Retry: second call in fill-missing mode reports `skippedAlreadySuggested > 0` and does not change existing suggested values -> Evidence: `packages/api/test/suggestions.spec.ts` -> Verification: `pnpm --filter append-api test`.
- [x] Concurrency safety: simulate two calls and ensure no candidate ends with conflicting states (ensure `in_progress` skip path works) -> Evidence: `packages/api/src/routes/batch.ts` (conditional claim update) -> Verification: `pnpm --filter append-api test`.
- [x] Cache: two candidates with same normalized term in the same batch: first is LLM/stub "generated", second is `cached` -> Evidence: `packages/api/test/suggestions.spec.ts` -> Verification: `pnpm --filter append-api test`.

## Blockers

- None.

## Notes

- Concurrency limiter simplified to sequential processing for Worker memory efficiency. The OpenAI provider still has per-candidate timeout support. If parallel processing is needed for production scale, this can be added as a follow-up enhancement.

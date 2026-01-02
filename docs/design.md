# Append — Design (personal, cloud-first)

## Decisions (current)

- Canonical store: `append` (do not write to the ENG-LOG GitHub repo).
- App architecture: SPA (React + TanStack Router) + Hono on Cloudflare Workers (ADR: `docs/adr/0004-spa-hono-workers.md`).
- Auth/access: Google SSO allowlist (ADR: `docs/adr/0001-google-allowlist-auth.md`).
- Web auth gating: protected layout route via AppShell (ADR: `docs/adr/0005-web-auth-gating-protected-layout.md`, superseded by `docs/adr/0015-web-ui-linear-sidebar-layout.md` for UI implementation).
- Web UI: Linear-style sidebar layout with keyboard shortcuts (ADR: `docs/adr/0015-web-ui-linear-sidebar-layout.md`).
- Duplicates: `Term` + append-only `TermSense` ("allowed-but-flagged") (ADR: `docs/adr/0002-term-sense-duplicates.md`).
- Bucket feed UX: primary sense by default, expandable, "Needs review" view (ADR: `docs/adr/0003-bucket-feed-primary-sense.md`).
- UX north-star: "fast capture → AI suggests → you accept → it becomes an append-only log entry".
- LLM provider/model: OpenAI `gpt-5-mini` via Cloudflare AI Gateway (ADR: `docs/adr/0006-openai-gpt-5-mini-via-ai-gateway.md`).
- Step 3 suggestion storage: latest suggestion fields live on `Candidate` + per-term cache (ADR: `docs/adr/0007-step-3-suggestions-on-candidate-plus-cache.md`).
- Custom buckets: user-owned dynamic buckets, max 20 per user (ADR: `docs/adr/0012-custom-user-buckets.md`).
- Type sharing: Hono RPC for end-to-end type safety between API and web (ADR: `docs/adr/0013-hono-rpc-type-sharing.md`).
- Module boundaries: `lib` cannot depend on `platform`; shared types live in `shared` (ADR: `docs/adr/0014-module-boundaries-platform-types.md`).

## Origins (ENG-LOG)

This app evolved from **ENG-LOG**, a minimal, append-only engineering log:

- Five bucket markdown files, bullet-only, append-only.
- No tags, folders, or reorganization; just append and search.
- Legacy format repo: https://github.com/tindotdev/eng-log (import/export contract).

## Current stage

- Vertical slice steps 1–7 are complete and archived.
- Focus: review all slices, refresh UI, and refactor where needed without changing locked decisions.

## Phase 1 — Domain (storage-agnostic)

### Glossary

- **ENG-LOG**: the original minimal append-only engineering log (five bucket markdown files + rules). Legacy source repo: https://github.com/tindotdev/eng-log (defines the import/export format).
- **Term (input)**: a word/phrase you want to learn (what you paste/type).
- **Capture batch**: a group of Term (input) captured together.
- **Candidate**: a Term (input) inside a batch with optional suggestions/edits, not yet accepted.
- **Suggestion**: AI-proposed one-liner + bucket for a Candidate (stored on `Candidate` for Step 3; see `docs/adr/README.md`).
- **Bucket**: user-owned category entity (slug, name, description, color, order). New users get 5 default tech-focused buckets on signup (fully editable). Max 20 per user. See ADR 0012.
- **Term (entity)**: the canonical concept keyed by the normalized term (`canonical`).
- **Sense**: an append-only meaning/usage note for a Term (entity) (one-liner, analogy, etc).
- **Export**: rendering Terms/Senses back into ENG-LOG-compatible markdown files (convenience, not source of truth).
- **Import**: migrating legacy ENG-LOG markdown into `append` Terms/Senses.

### Invariants (“must always be true”)

- Every Sense belongs to exactly one Bucket.
- Senses are append-only at the semantic level:
  - no in-place edits to “fix” history;
  - corrections are new entries;
  - “removal” is a soft delete/archival (audit remains).
- Accept/accept-all is idempotent: retries must not create duplicate effects.
- Candidate edits must never silently overwrite changes made elsewhere (detect conflicts and require explicit resolution).
- AI outputs are suggestions only; the user is the authority.

### State machines

**Candidate**

- `captured → suggested → (edited?) → accepted → materialized_as_term_sense → done`
- optional: `suggested → archived`

**Import run**

- `queued → parsing → preview_ready → committing → done` (retry-safe)

### Domain events (optional but useful)

- `BatchCaptured`, `SuggestionsGenerated`, `CandidateEdited`, `CandidateAccepted`, `TermCreated`, `TermSenseCreated`
- `ImportStarted`, `ImportPreviewReady`, `ImportCommitted`, `ImportFailed`

## Phase 2 — Use-cases

### Commands (writes)

- `CaptureTerms(termList, client_request_id)` → creates batch + candidates (idempotent)
  - preserves input order (post-trim) and allows duplicates as distinct candidates (no dedupe at capture time)
- `GenerateSuggestions(batch_id)` → generates suggestions (retry-safe; partial allowed)
- `EditCandidate(candidate_id, patch, expected_version)` → optimistic locking
- `AcceptCandidate(candidate_id, client_request_id)` → creates/attaches a Sense (idempotent)
- `AcceptAll(batch_id, client_request_id)` → creates/attaches Senses for all candidates (idempotent)
- `ArchiveCandidate(candidate_id)`
- `ImportEngLog(files_or_text, client_request_id)` → parse → preview → commit (idempotent)

### Queries (reads)

- `ListBatches(cursor?)`
- `GetBatch(batch_id)` (candidates + latest suggestion + acceptance state)
- `SearchTerms(query, bucket?, cursor?)` (term + senses)
- `GetBucketFeed(bucket, cursor?)` (append-only “timeline”)
- `GetNeedsReview(cursor?)` (flagged/conflicting terms)
- `ExportBuckets(format=markdown)` (download/view)

### Error cases

- LLM partial/failed outputs; user edits during suggestion run.
- Duplicate terms (same batch / across history).
- Import parsing ambiguity (non-bullet lines, malformed markdown).
- Retry duplicates (accept-all/import/export).

## Phase 3 — Data model (storage-agnostic)

### Entities

- `User` (Google subject, email)
- `Bucket` (id, user_id, slug, name, description, color?, order, created_at, updated_at)
- `Batch` (id, user_id, status, created_at)
- `Candidate` (id, batch_id, term, normalized_term, status, chosen_bucket_id?, chosen_text?, version, suggested_bucket_id?, suggested_text?, suggestion_status?, suggestion_error?, suggestion_attempts, suggestion_model, suggestion_prompt_version, suggestion_updated_at?, materialized_term_id?, materialized_term_sense_id?, created_at)
- `SuggestionCache` (user_id, normalized_term, model, prompt_version, suggested_bucket_id, suggested_text, created_at, updated_at)
- `Term` (id, user_id, canonical, display_term, primary_sense_id?, created_at, archived_at?)
- `TermSense` (id, term_id, bucket_id, text, source, sense_label?, flagged_reason?, created_at, archived_at?)
- `IdempotencyKey` (user_id, scope, key, result_ref, created_at, expires_at?)
- `ImportRun` (id, user_id, status, idempotency_key, stats, created_at)

### Derived fields

- `normalized_term` = lowercased + whitespace-collapsed for search/dedupe.
- `bullet_line` = `- {display_term}: {text}` for markdown export (usually from primary sense or latest sense).

## Phase 4 — Consistency & concurrency (Cloudflare-first)

- Atomicity boundary:
  - `CaptureTerms`: batch + candidates in one atomic D1 batch write.
  - `AcceptAll`: may partially succeed; retries are safe and resume using per-candidate materialization pointers (see `docs/adr/README.md`).
- Idempotency:
  - capture/accept/import must record a result ref keyed by `(user_id, scope, client_request_id)`.
- Accept-all idempotency:
  - accept-all is safe to retry (even with a different request id) by recording per-candidate materialization pointers (see `docs/adr/README.md`).
- Concurrency:
  - Use optimistic locking: `EditCandidate` requires `expected_version`; conflict returns 409 with latest state.
- “No overwrites” rule:
  - suggestions never overwrite user-chosen fields; they are stored separately from `chosen_*` fields (see `docs/adr/README.md`).

## Phase 5 — Storage & indexing (Cloudflare-first)

- Runtime: Cloudflare Workers (Hono).
- Frontend hosting: static SPA (Cloudflare Pages).
- DB: Cloudflare D1 (relational).
- Indexing:
  - `Bucket(user_id, order)` — ordered bucket list per user
  - `Term(user_id, canonical)`
  - `TermSense(term_id, created_at)`
  - optional: D1 FTS later for sense text.

## Phase 6 — Integration

### Component diagram (logical)

- SPA UI (capture/edit/accept/search)
- Worker API (Hono)
- D1 (canonical store)
- LLM provider (suggestions + later "feedback" grading): OpenAI `gpt-5-mini` via Cloudflare AI Gateway; prompt built dynamically from user's bucket slugs and descriptions (see ADRs 0006, 0012)
- Google OAuth (SSO)
  - Fail closed if neither `ALLOWED_SUB` nor `ALLOWED_EMAIL` is configured (see `docs/adr/README.md`)

### Import/export

- Import: accept ENG-LOG markdown and turn each bullet into a `Term` + `TermSense` with `source=import` (canonical dedupe applies).
- Export: render by bucket into markdown files (one per bucket, stable ordering by `created_at`).

## Default buckets (seeded on signup)

New users get 5 tech-focused buckets pre-seeded (fully editable):

| Slug | Name | Description |
|------|------|-------------|
| foundations | Foundations | Core CS concepts, algorithms, data structures |
| backend | Backend | Server-side patterns, APIs, databases, storage |
| frontend | Frontend | UI patterns, React, state management, conflict UX |
| dx-tooling | DX Tooling | Build tools, migrations, scripts, CI/CD |
| deep-concepts | Deep Concepts | System design, CAP theorem, architecture |

Example concepts by bucket:

- Foundations: `Idempotency keys`, `Optimistic locking`
- Backend: `Append-only senses`, `Import preview + commit pattern`
- Frontend: `Accept-all workflow`, `Conflict UX (409 refresh)`
- DX-tooling: `D1 migrations`, `Seed/import scripts`
- Deep-concepts: `Append-only vs edits`, `Auditability vs convenience`

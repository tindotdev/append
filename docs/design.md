# Append — Design (personal, cloud-first)

## Decisions (current)

- Canonical store: `append` (do not write to the ENG-LOG GitHub repo).
- App architecture: SPA (React + TanStack Router) + Hono on Cloudflare Workers (ADR: `docs/adr/0004-spa-hono-workers.md`).
- Auth/access: Google SSO allowlist (ADR: `docs/adr/0001-google-allowlist-auth.md`).
- Duplicates: `Term` + append-only `TermSense` (“allowed-but-flagged”) (ADR: `docs/adr/0002-term-sense-duplicates.md`).
- Bucket feed UX: primary sense by default, expandable, “Needs review” view (ADR: `docs/adr/0003-bucket-feed-primary-sense.md`).
- UX north-star: “fast capture → AI suggests → you accept → it becomes an append-only log entry”.

## Phase 1 — Domain (storage-agnostic)

### Glossary

- **Term (input)**: a word/phrase you want to learn (what you paste/type).
- **Capture batch**: a group of Term (input) captured together.
- **Candidate**: a Term (input) inside a batch with optional suggestions/edits, not yet accepted.
- **Suggestion**: AI-proposed one-liner + bucket for a Candidate.
- **Bucket**: one of `foundations | backend | frontend | dx-tooling | deep-concepts`.
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
- `Batch` (id, user_id, status, created_at)
- `Candidate` (id, batch_id, term, normalized_term, status, chosen_bucket?, chosen_text?, version, created_at)
- `Suggestion` (id, candidate_id, suggested_bucket, suggested_text, model_meta, created_at)
- `Term` (id, user_id, canonical, display_term, primary_sense_id?, created_at, archived_at?)
- `TermSense` (id, term_id, bucket, text, source, sense_label?, flagged_reason?, created_at, archived_at?)
- `IdempotencyKey` (user_id, scope, key, result_ref, created_at, expires_at?)
- `ImportRun` (id, user_id, status, idempotency_key, stats, created_at)

### Derived fields

- `normalized_term` = lowercased + whitespace-collapsed for search/dedupe.
- `bullet_line` = `- {display_term}: {text}` for markdown export (usually from primary sense or latest sense).

## Phase 4 — Consistency & concurrency

- Atomicity boundary:
  - `CaptureTerms`: batch + candidates in one transaction.
  - `AcceptAll`: all senses for a batch in one transaction (preferred).
- Idempotency:
  - capture/accept/import must record a result ref keyed by `(user_id, scope, client_request_id)`.
- Concurrency:
  - Use optimistic locking: `EditCandidate` requires `expected_version`; conflict returns 409 with latest state.
- “No overwrites” rule:
  - suggestions never overwrite user-chosen fields; they’re separate records.

## Phase 5 — Storage & indexing (Cloudflare-first)

- Runtime: Cloudflare Workers (Hono).
- Frontend hosting: static SPA (Cloudflare Pages).
- DB: Cloudflare D1 (relational).
- Indexing:
  - `Term(user_id, canonical)`
  - `TermSense(term_id, created_at)`
  - optional: FTS later for sense text
  - optional: D1 FTS later for body text.

## Phase 6 — Integration

### Component diagram (logical)

- SPA UI (capture/edit/accept/search)
- Worker API (Hono)
- D1 (canonical store)
- LLM provider (suggestions + later “feedback” grading)
- Google OAuth (SSO)

### Import/export

- Import: accept ENG-LOG markdown (5 files) and turn each bullet into a `Term` + `TermSense` with `source=import` (canonical dedupe applies).
- Export: render by bucket into 5 markdown files (stable ordering by `created_at`).

## ENG-LOG bucket mapping (writeback)

- Foundations: `Idempotency keys`, `Optimistic locking`
- Backend: `Append-only senses`, `Import preview + commit pattern`
- Frontend: `Accept-all workflow`, `Conflict UX (409 refresh)`
- DX-tooling: `D1 migrations`, `Seed/import scripts`
- Deep-concepts: `Append-only vs edits`, `Auditability vs convenience`

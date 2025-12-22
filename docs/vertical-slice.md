# Append — First vertical slice (runnable path)

## Goal

Ship a usable "off-load the brain" flow end-to-end, with canonical storage inside `append`.

## Slice definition

1. [x] **Google SSO login** — ADR 0001 (allowlist: sub-first, email fallback).
2. [ ] **Paste 20–200 terms into "New batch"** (20–200 non-empty lines after trimming)
   - Domain schema: `bucket`, `term`, `term_sense`, `batch`, `candidate`.
   - `POST /api/batch` parses newline-separated input (trim lines, drop empties), creates batch + candidates.
   - Candidate order preserves the post-trim input order; duplicates remain distinct candidates.
   - UI: `/batch/new` with textarea → submit → redirect to review (routes live under the protected layout; ADR 0005).
3. [ ] **Worker API generates suggestions** (bucket + one-liner)
   - `POST /api/batch/:id/suggest` calls LLM for each candidate.
   - Writes `suggested_bucket` + `suggested_text` to the candidate record(s).
4. [ ] **UI review list**
   - `/batch/:id` shows candidates with editable bucket + text fields.
   - "Accept all" button.
   - Per-item accept (optional stretch).
5. [ ] **Accept-all materializes rows**
   - `POST /api/batch/:id/accept` creates `term` + `term_sense` (idempotent).
   - Marks batch `status = 'accepted'`.
6. [ ] **Bucket feed page**
   - `/bucket/:slug` lists terms with primary sense.
   - Shows newly appended entries.
7. [ ] **Export page**
   - `/export` downloads 5 markdown files in ENG-LOG format.

## Current focus

**Step 2: Domain schema + batch input**

## Done criteria

- Re-running accept-all (retry) creates zero duplicates.
- Edits are version-checked (409 on conflict).
- Export output is deterministic and stable across refreshes.

## Deployment notes

- API lives in `packages/api` and deploys to Cloudflare Workers via `pnpm deploy:api`.
- Web lives in `packages/web` and is intended to deploy to Cloudflare Pages (build output: `packages/web/dist`).

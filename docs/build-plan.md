# Append — Build plan (milestones)

## Current stage

- Vertical slice steps 1–7 are complete and archived (see `docs/archive/vertical-slice.md`).
- Focus now: review all slices, refresh UI, and refactor where needed.

## Milestone 1 — Canonical log entries (no AI, no import)

- Google SSO login.
- Create/view bucket feeds.
- Manual add sense (term + text + bucket).
- If term already exists: add another sense (append-only), optionally flagged.
- Basic search (term + sense text).

## Milestone 2 — Capture batches + accept flow (no AI)

- Capture batch (paste many terms).
- Edit candidate fields.
- Accept/accept-all → materialize as Term + Sense (idempotent; duplicates attach as new senses).

## Milestone 3 — AI suggestions (Case 1)

- Generate suggestions for a batch.
- Per-item accept/edit; accept-all.
- Cost controls (batch size limits, caching by normalized term).

## Milestone 4 — Import ENG-LOG markdown (migration)

- Upload/paste the five markdown files.
- Parse → preview (diff/stats) → commit import (idempotent).
- Dedupe policy: exact duplicates attach as new senses and are flagged if bucket differs.

## Milestone 5 — “Explain it myself” feedback loop (Case 2)

- Add explanation entries per term (one-liner/analogy/pseudocode).
- LLM grader feedback (correct/unclear/wrong + brief guidance).
- Track iterations as append-only explanation attempts.

## Implementation note

- Stack: SPA (React + TanStack Router) hosted on Cloudflare Pages + Hono API on Cloudflare Workers (ADR: `docs/adr/0004-spa-hono-workers.md`).

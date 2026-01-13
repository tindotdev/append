# ADR 0002 — Duplicates become senses (allowed-but-flagged)

Status: Superseded by ADR 0020
Date: 2025-12-19
Superseded: 2026-01-08

## Context

In “offload the brain”, you will capture many terms quickly.

If duplicates are allowed as standalone rows, the system becomes noisy (same term repeated many times).
If duplicates are skipped, useful nuance can be lost (same token, different meaning/context).

We want:

- no data loss
- low-noise browsing/search
- minimal janitorial work
- append-only semantics preserved

## Decision

Represent concepts as:

- `Term`: the canonical concept keyed by a **canonical key** (unique per user)
- `TermSense`: an append-only meaning/usage note attached to a Term

`canonical = normalize(term)` where normalize:

- trim
- lowercase
- collapse whitespace
- (optional later) strip punctuation

**Duplicate definition**

- Exact duplicate: same `canonical`
- Variant: same `canonical` but with an explicit `sense_label` (e.g., `aggregate (DDD)`)
- Near-duplicate (later): similarity-based heuristics

**Write behavior (default)**

- If `canonical` is new: create `Term` + first `TermSense`
- If `canonical` exists: attach a new `TermSense`
- If the new Sense disagrees with the Term’s primary bucket (or other conflict rules): mark the Sense as `flagged`

**Primary meaning**

- Term has a `primary_sense_id` pointer.
- Changing the primary sense is a pointer update (no rewriting of historical senses).

## Consequences

- Prevents database spam (one Term per canonical).
- Preserves nuance (multiple senses).
- Enables a clean “calm by default” feed (show primary sense, expand for others).
- Requires UI affordances for `+N` senses and a “Needs review” queue for flagged items.

## Alternatives considered

- Allow duplicates as separate Terms: noisy, hurts navigation and search.
- Skip duplicates: loses useful context and can silently discard meaning.
- Force sense tagging up front: slows down the brain-dump workflow.

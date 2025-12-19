# ADR 0003 — Bucket feed shows primary sense by default

Status: Accepted
Date: 2025-12-19

## Context

The bucket feed is a navigation + recall surface, not a moderation queue.
Showing all senses by default turns the feed into clutter.

We also need a way to surface conflicts/flagged items without polluting the everyday view.

## Decision

- Bucket feed shows **one row per Term** by default:
  - Term display text
  - primary sense text
  - bucket (from primary sense)
  - badges: `+N` extra senses, `⚠` flagged/conflict indicator
- Expand/collapse per Term reveals other senses (collapsed by default).
- Provide a “Needs review” view:
  - lists flagged/conflicting Terms
  - auto-expands senses for faster review

## Consequences

- Calm, usable feed for daily recall.
- Review mode remains thorough without imposing on the default view.
- Requires an explicit “flagging” model and an API/query to fetch flagged Terms.

## Alternatives considered

- Show all senses by default: too noisy, duplicates feel like clutter.
- Hide senses entirely: loses nuance and makes duplicates hard to manage.


# Architecture Decision Records (ADRs)

This folder stores **append-only decisions + rationale**.

Rules:

- Prefer adding a new ADR over editing old ones.
- If a decision changes, add a new ADR and mark the old one **Superseded**.
- Keep `docs/design.md` as the “current snapshot” and link to ADRs for the why.

## Index

- `0001-google-allowlist-auth.md` — Google SSO with allowlist (sub-first, email fallback)
- `0002-term-sense-duplicates.md` — Duplicate handling via `Term` + `TermSense` (allowed-but-flagged)
- `0003-bucket-feed-primary-sense.md` — Bucket feed shows primary sense by default (expand for more; review mode)
- `0004-spa-hono-workers.md` — SPA (React + TanStack Router) + Hono on Workers (no SSR)

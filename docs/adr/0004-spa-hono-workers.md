# ADR 0004 — SPA + Hono on Cloudflare Workers (no SSR)

Status: Accepted
Date: 2025-12-19

## Context

Append is a private, single-user app. The primary workflow is interactive and client-driven.

Using a full-stack SSR framework on Cloudflare can introduce:

- operational overhead (adapters, edge/Node differences)
- complexity tax during iteration (deployment + runtime quirks)
- unnecessary SSR cost for a purely personal tool

We still want:

- Cloudflare-first hosting
- a clean, typed API surface
- simple deploys and low ops

## Decision

- Frontend: SPA (React) with TanStack Router.
- Backend: Hono running on Cloudflare Workers.
- Types: optional Hono RPC (or shared types) for type-safe client/server calls.
- Keep the rest of the platform Cloudflare-first (D1 for relational storage).

## Consequences

- Faster iteration and lower deployment/runtime overhead versus SSR on Cloudflare.
- SEO/SSR benefits are intentionally traded away (acceptable for private use).
- Auth must be implemented in Workers (Google OAuth), rather than relying on SSR framework auth integrations.

## Alternatives considered

- Next.js on Cloudflare via OpenNext adapter: rejected due to SSR/adapter overhead relative to value for a private app.
- Next.js on Vercel: rejected because Cloudflare-first preference and desire to keep runtime consistent.

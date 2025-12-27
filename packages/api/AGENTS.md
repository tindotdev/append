# AGENTS.md — packages/api

## Purpose

- Hono API running on Cloudflare Workers with D1 as the canonical store.

## Commands

- `pnpm dev` (local worker via Wrangler)
- `pnpm deploy` (deploy worker)
- `pnpm test` (Vitest)
- `pnpm db:migrate:local` (apply D1 migrations locally)
- `pnpm typecheck`

# ADR 0005 — Web auth gating via protected layout route

Status: Superseded by ADR 0015
Date: 2025-12-22
Superseded: 2026-01-01

> **Note**: The protected layout **concept** (auth gating via layout route) remains valid and is still in use. However, the physical implementation component (`ProtectedLayout.tsx`) has been replaced by `AppShell.tsx` with a Linear-style sidebar. See ADR 0015 for the new UI architecture.

## Context

Append is a SPA (TanStack Router). The current web app gates authentication inside the `/` route component by rendering a sign-in prompt when there is no session.

As we add more pages (e.g. `/batch/new`, `/batch/:id`, bucket feed, export), per-route gating becomes easy to forget and can accidentally allow unauthenticated access to pages that assume a valid session.

We also want a shared “signed-in shell” (header/nav) without duplicating it across pages.

## Decision

Add an **authenticated layout route** (a protected layout) that:

- performs the session gate (loading → sign-in prompt → signed-in shell)
- renders child routes via an outlet

All routes that require authentication (including `/batch/*`) live under this protected layout. Any intentionally public routes (if added later) must be siblings outside the protected layout.

## Consequences

- New authenticated pages are protected by default when added under the layout.
- Shared UI (header/nav) has a single, consistent home.
- Auth gating behavior remains consistent across the app; the existing “sign in to continue” UX is reused.

## Alternatives considered

- Gate inside every route component (`/batch/new`, `/batch/:id`, etc.): rejected due to repetition and higher risk of accidental bypass when new routes are added.


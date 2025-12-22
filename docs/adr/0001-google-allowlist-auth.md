# ADR 0001 — Google SSO allowlist (sub-first)

Status: Accepted
Date: 2025-12-19

## Context

Append is personal-use software but cloud-hosted and reachable from multiple devices.
We want in-app sign-in, and the simplest secure posture is “single owner account”.

Google OAuth can provide a stable account identifier (`sub`) and (sometimes) a reliable email claim.

## Decision

- Use Google SSO for authentication.
- Restrict access via an **allowlist**:
  - primary check: Google `sub` (stable per Google account + OAuth client)
  - fallback check: email (case-insensitive), only if `sub` is not configured/available
- Fail closed:
  - if user is not allowlisted, deny access even if Google auth succeeds

## Consequences

- Simple, strong access control without building multi-user auth/roles.
- Requires initial setup of allowed `sub` (or email) via env/config.
- **Fail closed** in runtime if neither `ALLOWED_SUB` nor `ALLOWED_EMAIL` is configured.
- If Google account is changed (new account), allowlist must be updated.

## Alternatives considered

- Cloudflare Access (no in-app auth): simpler, but user explicitly wants in-app sign-in.
- Multi-user auth/teams: unnecessary complexity for personal use.

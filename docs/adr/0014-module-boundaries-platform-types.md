# ADR 0014 — Module Boundaries for Platform Types

Status: Accepted
Date: 2025-12-31

## Context

The API package enforces module boundaries via `eslint` (boundaries rules). Files under `src/lib` are not allowed to depend on `src/platform`. We briefly reused `platform` bindings types in `lib/auth`, which violated the boundary rules.

We still want a single runtime bindings shape, but must respect the `lib` → `platform` boundary.

## Decision

- Keep platform-specific bindings and runtime helpers in `src/platform`.
- `src/lib/*` must **not** import from `src/platform`.
- When `lib` needs a narrowed env shape, define a local `Env` type in the file (duplication is acceptable).
- If a type must be shared across `lib` and other layers, place it in `src/shared` instead of `src/platform`.

## Consequences

### Positive

- Boundaries lint stays green and dependency rules are enforced.
- Platform code remains isolated.

### Negative

- Some environment type duplication in `lib` modules.

## References

- Boundaries rule: `pnpm lint:boundaries`

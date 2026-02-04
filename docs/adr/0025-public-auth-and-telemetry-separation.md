# ADR 0025 — Public auth and telemetry separation

Status: Accepted
Date: 2026-02-04
Supersedes: ADR 0001

## Context

Append was initially built as personal-use software with strict allowlist-based authentication (ADR 0001). To enable public release while controlling costs and abuse, we need to:

1. Allow public sign-ups without losing the ability to restrict access when needed
2. Separate "can sign in" from "can ingest telemetry events" to control the highest-volume write path
3. Maintain a safe-by-default posture with explicit operational controls

The current architecture uses:
- Google OAuth via Better Auth (ADR 0001)
- Extension ingest protected by device tokens + CORS allowlist (ADR 0021)
- Cloudflare Developer plan (not free-tier), requiring explicit cost controls

## Decision

### Auth mode switch

Add an `AUTH_MODE` environment variable to control sign-up behavior:

- **`AUTH_MODE=restricted`** (default): Current allowlist behavior preserved
  - Users must be in `ALLOWED_SUB` or `ALLOWED_EMAIL` to sign in
  - Fails closed if user is not allowlisted
  - Use for preview/staging environments or when public sign-up needs to be disabled

- **`AUTH_MODE=public`**: Public sign-up enabled
  - Any Google account can sign in (sign-in creates account automatically)
  - Allowlist enforcement is skipped
  - Use for production public release

### Telemetry ingest separation

Decouple "public sign-up" from "telemetry ingest access":

1. **Device token minting** (`POST /api/device-tokens`):
   - Blocked by default for public users in `AUTH_MODE=public`
   - Enabled when `TELEMETRY_PAIRING_ENABLED=1` **or** user is explicitly allowlisted for telemetry (dogfooding / staged rollout)

2. **Extension ingest** (`/events/ingest`):
   - Continues to require device tokens + extension ID allowlist (ADR 0021)
   - No changes to ingest endpoint; control is at the token-minting layer

3. **Public account capabilities** (at launch):
   - Can sign in and use dashboard features
   - Can create/edit terms manually
   - Can use term suggestions (subject to quotas; see ADR 0026)
   - **Cannot** pair browser extension or ingest telemetry events

### OAuth configuration

- **Provider**: Google OAuth only (no additional providers at launch)
- **Sign-in flow**: Sign-in automatically creates account if it doesn't exist (in `AUTH_MODE=public`)
- **User onboarding**: Add lightweight first-run flow after sign-up:
  - Timezone selection
  - Privacy statement acknowledgment
- **OAuth consent screen**: Update for production domains and public audience

### Guest experience (launch posture)

- **`/demo` route**: Public, no-auth demo experience (existing functionality)
- **All other routes**: Sign-in required
- No server-backed anonymous accounts
- Optional future enhancement: local-only guest mode (IndexedDB) if conversion is low

## Consequences

### Positive

- Public users can sign up and explore the product without allowlist management
- Telemetry ingest (highest write volume) remains gated, providing strong cost control
- Safe-by-default: public accounts start with minimal write permissions
- `AUTH_MODE` switch provides operational flexibility (can revert to restricted if needed)
- Preserves existing allowlist behavior in `AUTH_MODE=restricted` for staging/preview

### Negative

- Public accounts cannot use browser extension pairing at launch (limits value proposition)
- Two-tier user experience (allowlisted users get telemetry, public users don't)
- Requires careful operational discipline when toggling `AUTH_MODE` and `TELEMETRY_PAIRING_ENABLED`

### Mitigations

- Clear UI messaging about extension pairing availability
- Dashboard-first UX (ADR 0020) ensures value even without telemetry ingest
- Monitor sign-up demand to inform future telemetry rollout decisions
- Document operational procedures for toggling auth modes

## Implementation notes

### Better Auth hooks

Update `packages/api/src/lib/auth/index.ts`:

```typescript
// Before sign-in/sign-up
const authMode = env.AUTH_MODE || 'restricted';

if (authMode === 'restricted') {
  // Apply allowlist enforcement (current logic)
  const allowedSub = env.ALLOWED_SUB;
  const allowedEmail = env.ALLOWED_EMAIL;
  if (!allowedSub && !allowedEmail) {
    throw new Error('Auth allowlist not configured');
  }
  // ... check user.sub / user.email ...
}
// else: authMode === 'public', skip allowlist check
```

### Device token minting

Update `POST /api/device-tokens` handler:

```typescript
const authMode = env.AUTH_MODE || 'restricted';
const telemetryEnabled = env.TELEMETRY_PAIRING_ENABLED === '1';
const allowedTelemetrySubs = env.ALLOWED_TELEMETRY_SUBS?.split(',') || [];

if (authMode === 'public') {
  // Public release posture: telemetry pairing is off by default. It can be enabled for:
  // - everyone via TELEMETRY_PAIRING_ENABLED=1, or
  // - specific dogfooding accounts via ALLOWED_TELEMETRY_SUBS
  const isAllowlistedForTelemetry = allowedTelemetrySubs.includes(user.sub);
  if (!telemetryEnabled && !isAllowlistedForTelemetry) {
    return c.json({ error: 'Device pairing not available' }, 403);
  }
}

// else: authMode === 'restricted' or user is allowlisted, proceed
```

### Environment variables

Add to `packages/api/wrangler.jsonc` and Doppler:

- `AUTH_MODE`: `restricted` | `public` (default: `restricted`)
- `TELEMETRY_PAIRING_ENABLED`: `0` | `1` (default: `0`)
- `ALLOWED_TELEMETRY_SUBS`: comma-separated Google `sub` values (optional)

### Kill switch

Add `PUBLIC_SIGNUP_ENABLED` for emergency shutoff:

```typescript
if (env.PUBLIC_SIGNUP_ENABLED === '0' && authMode === 'public') {
  return c.json({ error: 'Sign-ups temporarily disabled' }, 503);
}
```

## Alternatives considered

### 1. Keep allowlist-only (no public sign-up)

- Pro: Simplest, no abuse risk
- Con: Doesn't support public release goal; requires manual user management

### 2. Public sign-up with server-backed anonymous accounts

- Pro: Frictionless trial experience
- Con: Creates write vectors without auth; requires complex cleanup/conversion flow; high abuse risk

### 3. Enable telemetry ingest for all public users at launch

- Pro: Full feature parity
- Con: High cost risk (telemetry is highest write volume); complex quota design; difficult to revert

### 4. Add email/password auth alongside Google OAuth

- Pro: Broader audience reach
- Con: More complex auth implementation; password reset flows; increased support burden

## References

- ADR 0001 (superseded): Google allowlist auth
- ADR 0019: E2E auth bootstrap for preview environments
- ADR 0020: Events-first learning telemetry (dashboard-first UX makes telemetry optional)
- ADR 0021: Extension device token auth
- ADR 0026: Term suggestion quotas (complementary cost control)

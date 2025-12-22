# Better Auth `getSession` API Reference

Reference for server-side session validation in Better Auth v1.4.7+.

## Call Signature

```ts
const { headers, response: session } = await auth.api.getSession({
  headers: c.req.raw.headers,  // Pass request headers containing session cookie
  returnHeaders: true,          // Required to capture set-cookie for token refresh
});
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `headers` | `Headers` | Yes | Request headers containing the session cookie |
| `returnHeaders` | `boolean` | No | When `true`, returns response headers alongside session data |
| `disableCookieCache` | `boolean` | No | When `true`, bypasses cookie cache and queries DB directly |

## Return Types

### With `returnHeaders: true`

```ts
{
  headers: Headers;
  response: {
    session: {
      id: string;
      userId: string;
      token: string;
      expiresAt: Date;
      createdAt: Date;
      updatedAt: Date;
      // ... additional fields
    };
    user: {
      id: string;
      email: string;
      name: string;
      // ... additional fields
    };
  } | null;
}
```

### Without `returnHeaders` (default)

```ts
{
  session: { ... };
  user: { ... };
} | null
```

## Extracting Set-Cookie Headers

When Better Auth refreshes a session token (based on `updateAge` settings), it returns `set-cookie` headers that must be forwarded to the client.

```ts
const setCookie = headers.get("set-cookie");
if (setCookie) {
  c.res.headers.append("set-cookie", setCookie);
}
```

### Multiple Cookies

`Headers.get("set-cookie")` concatenates multiple values with `, `. For precise handling:

```ts
// Modern runtimes (check availability in Workers)
const cookies = headers.getSetCookie?.() ?? [];
for (const cookie of cookies) {
  c.res.headers.append("set-cookie", cookie);
}
```

## Hono Middleware Example

```ts
import { createMiddleware } from "hono/factory";

type AuthEnv = {
  Variables: {
    auth: ReturnType<typeof createAuth>;
    userId: string;
  };
};

const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const auth = c.get("auth");

  const { headers, response: session } = await auth.api.getSession({
    headers: c.req.raw.headers,
    returnHeaders: true,
  });

  // Forward set-cookie headers for token refresh
  const setCookie = headers.get("set-cookie");
  if (setCookie) {
    c.res.headers.append("set-cookie", setCookie);
  }

  if (!session) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      401
    );
  }

  c.set("userId", session.user.id);
  await next();
});
```

## Key Behaviors

1. **Null session**: Returns `null` when no valid session exists (expired, invalid, or missing cookie).

2. **Cookie cache**: By default, session data may be served from cookie cache. Use `disableCookieCache: true` to force DB lookup.

3. **Token refresh**: When a session is close to expiry (within `updateAge`), Better Auth automatically refreshes the token and returns new `set-cookie` headers.

4. **Custom session fields**: If using the `customSession` plugin, additional fields are recomputed on each call (not cached).

## Sources

- [Session Management | Better Auth](https://www.better-auth.com/docs/concepts/session-management)
- [API Concepts | Better Auth](https://www.better-auth.com/docs/concepts/api)
- [Hono Integration | Better Auth](https://www.better-auth.com/docs/integrations/hono)
- [GitHub Issue #3996](https://github.com/better-auth/better-auth/issues/3996) - returnHeaders parameter
- [GitHub Issue #3780](https://github.com/better-auth/better-auth/issues/3780) - Type issues with getSession

# TanStack Router: Authentication & Protected Routes

Reference document summarizing official patterns from TanStack Router documentation.

## Core Principle

Use `beforeLoad` for authentication checks, not component-level checks.

> "Use `beforeLoad` instead of component-level auth checks" to prevent "protected content briefly shows before redirecting to login."

## Recommended Pattern: beforeLoad + Router Context

### 1. Define Router Context Type

```tsx
interface MyRouterContext {
  auth: {
    isAuthenticated: boolean;
    user: User | null;
    isPending: boolean;
  };
}
```

### 2. Create Root Route with Context

```tsx
import { createRootRouteWithContext } from "@tanstack/react-router";

const rootRoute = createRootRouteWithContext<MyRouterContext>()({
  component: () => (
    <>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
});
```

### 3. Protected Layout Route with beforeLoad

```tsx
const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "protected", // pathless layout route
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: "/sign-in",
        search: { redirect: location.href },
      });
    }
  },
  component: ProtectedLayout,
});
```

### 4. Provide Context via RouterProvider

```tsx
function InnerApp() {
  const { data: session, isPending } = useSession();

  return (
    <RouterProvider
      router={router}
      context={{
        auth: {
          isAuthenticated: !!session,
          user: session?.user ?? null,
          isPending,
        },
      }}
    />
  );
}
```

### 5. Register Router Types

```tsx
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

## Post-Login Redirect Pattern

Capture the original destination and redirect after authentication:

```tsx
// Sign-in route
const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  validateSearch: (search) => ({
    redirect: (search.redirect as string) || "/",
  }),
  beforeLoad: ({ context, search }) => {
    // Already authenticated? Redirect to destination
    if (context.auth.isAuthenticated) {
      throw redirect({ to: search.redirect });
    }
  },
  component: SignInPage,
});
```

## Alternative: Non-Redirect Auth (Modal Login)

For in-page login flows without redirect:

```tsx
const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "protected",
  component: () => {
    const { auth } = useRouterContext();
    if (!auth.isAuthenticated) {
      return <LoginModal />;
    }
    return <Outlet />;
  },
});
```

## Execution Order

Understanding when `beforeLoad` runs:

1. Route Matching (`params.parse`, `validateSearch`)
2. **Route Loading (`beforeLoad`, `onError`)** ← Auth check here
3. Parallel Loading (`component.preload`, `load`)

Key behavior: `beforeLoad` for a route runs **before** any child routes' `beforeLoad` functions, making it effective middleware for entire route subtrees.

## Anti-Patterns to Avoid

| Anti-Pattern                | Problem                            | Solution                               |
| --------------------------- | ---------------------------------- | -------------------------------------- |
| Component-level auth checks | Flash of protected content         | Use `beforeLoad`                       |
| `useEffect` + `navigate()`  | Reactive, race-prone               | Use `throw redirect()` in `beforeLoad` |
| Auth state not persisted    | Resets on page refresh             | Validate tokens on app load            |
| Hooks in `beforeLoad`       | Hooks can't run outside components | Use router context                     |

## File Structure (File-Based Routing)

```
routes/
  __root.tsx
  _auth.tsx                    # Redirects to / if already authenticated
  _auth/
    sign-in.lazy.tsx
  _authenticated.tsx           # Redirects to /sign-in if not authenticated
  _authenticated/
    index.lazy.tsx
    batch/
      new.lazy.tsx
      $batchId.lazy.tsx
```

## Handling Async Auth State

When auth state is async (e.g., `isPending`):

**Option A: Block until resolved**

```tsx
beforeLoad: async ({ context }) => {
  // Wait for auth to resolve if using a promise-based auth check
  const session = await context.auth.getSession();
  if (!session) {
    throw redirect({ to: "/sign-in" });
  }
};
```

**Option B: Hybrid approach**

- Use `beforeLoad` for definitive "not authenticated" redirect
- Use component for `isPending` loading state

```tsx
// Route
beforeLoad: ({ context }) => {
  if (!context.auth.isPending && !context.auth.isAuthenticated) {
    throw redirect({ to: "/sign-in" });
  }
};

// Component
component: () => {
  const { auth } = useRouterContext();
  if (auth.isPending) return <Loading />;
  return <Outlet />;
};
```

## Sources

- [How to Set Up Basic Authentication and Protected Routes](https://tanstack.com/router/latest/docs/framework/react/how-to/setup-authentication)
- [Authenticated Routes Guide](https://tanstack.com/router/v1/docs/framework/react/guide/authenticated-routes)

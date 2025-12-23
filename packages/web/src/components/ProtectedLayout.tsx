import { Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { signOut, useSession } from "../lib/auth";

export function ProtectedLayout() {
  // Use useSession directly for reactive auth state
  // (route context doesn't update reactively when RouterProvider context changes)
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  const isAuthenticated = !!session;

  // Redirect to sign-in when auth resolves to unauthenticated
  useEffect(() => {
    if (!isPending && !isAuthenticated) {
      navigate({ to: "/sign-in" });
    }
  }, [isPending, isAuthenticated, navigate]);

  // Show loading while auth is pending or redirecting
  if (isPending || !isAuthenticated) {
    return (
      <div className="min-h-screen p-8">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 px-8 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">append</h1>
          <div className="flex items-center gap-4">
            <span className="text-zinc-400 text-sm">{session.user?.email}</span>
            <button
              onClick={() => signOut()}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="p-8">
        <Outlet />
      </main>
    </div>
  );
}

import { Outlet, useRouteContext } from "@tanstack/react-router";
import { signOut } from "../lib/auth";

export function ProtectedLayout() {
  const { auth } = useRouteContext({ from: "/protected" });

  // Show loading while auth is pending (beforeLoad handles redirects)
  if (auth.isPending) {
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
            <span className="text-zinc-400 text-sm">{auth.user?.email}</span>
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

import { signIn, signOut, useSession } from "./lib/auth";

export function App() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="min-h-screen p-8">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen p-8">
        <h1 className="text-2xl font-bold">append</h1>
        <p className="mt-2 text-zinc-400">Sign in to continue</p>
        <button
          onClick={() =>
            signIn.social({
              provider: "google",
              callbackURL: window.location.origin,
            })
          }
          className="mt-4 rounded-lg bg-white px-4 py-2 text-black font-medium hover:bg-zinc-100 transition-colors"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">append</h1>
        <div className="flex items-center gap-4">
          <span className="text-zinc-400">{session.user.email}</span>
          <button
            onClick={() => signOut()}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
      <div className="mt-8">
        <p className="text-zinc-400">Welcome, {session.user.name}!</p>
        {/* App content will go here */}
      </div>
    </div>
  );
}

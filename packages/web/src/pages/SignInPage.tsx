import { useRouteContext } from "@tanstack/react-router";
import { signIn } from "../lib/auth";

export function SignInPage() {
  const { auth } = useRouteContext({ from: "/sign-in" });

  // Show loading while auth is pending (beforeLoad handles redirect if authenticated)
  if (auth.isPending) {
    return (
      <div className="min-h-screen p-8">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-2xl font-bold">append</h1>
      <p className="mt-2 text-zinc-400">Sign in to continue</p>
      <button
        onClick={() =>
          signIn.social({
            provider: "google",
            callbackURL: window.location.origin + "/batch/new",
          })
        }
        className="mt-4 rounded-lg bg-white px-4 py-2 text-black font-medium hover:bg-zinc-100 transition-colors"
      >
        Sign in with Google
      </button>
    </div>
  );
}

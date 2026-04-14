import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthToken, setAuthSession } from "@/lib/auth";
import { signIn, signUp } from "@/lib/api";

export const Route = createFileRoute("/auth")({
  beforeLoad: () => {
    if (getAuthToken()) {
      throw redirect({ to: "/console" });
    }
  },
  head: () => ({
    meta: [
      { title: "Sign In — Aether" },
      { name: "description", content: "Sign in or create your Aether account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const queryClient = useQueryClient();
  const navigate = Route.useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const signUpMutation = useMutation({
    mutationFn: signUp,
  });

  const signInMutation = useMutation({
    mutationFn: signIn,
  });

  const isSubmitting = signUpMutation.isPending || signInMutation.isPending;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError("Email and password are required.");
      return;
    }

    setError(null);

    try {
      const payload = { email: normalizedEmail, password };

      if (mode === "signup") {
        await signUpMutation.mutateAsync(payload);
      }

      const signinData = await signInMutation.mutateAsync(payload);

      setAuthSession({
        token: signinData.access_token,
        email: signinData.email ?? normalizedEmail,
      });

      queryClient.setQueryData(["auth", "session", signinData.access_token], {
        email: signinData.email ?? normalizedEmail,
      });

      await navigate({ to: "/console" });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed.");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 mb-10">
          <div className="flex h-10 w-10 items-center justify-center bg-neon border-3 border-foreground font-mono font-bold text-lg">
            Æ
          </div>
          <span className="text-xl font-bold tracking-tight">Aether</span>
        </Link>

        <div className="brutal-card p-8">
          <h1 className="text-2xl font-bold mb-1">
            {mode === "signin" ? "Welcome back" : "Create account"}
          </h1>
          <p className="text-muted-foreground text-sm mb-8">
            {mode === "signin" 
              ? "Sign in to access your console." 
              : "Start deploying functions in seconds."}
          </p>

          {error && (
            <div className="mb-4 rounded-md border-2 border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-semibold block mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="brutal-input w-full px-4 py-3 text-sm"
                placeholder="you@company.com"
                autoComplete="email"
                disabled={isSubmitting}
                required
              />
            </div>
            <div>
              <label className="text-sm font-semibold block mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="brutal-input w-full px-4 py-3 text-sm"
                placeholder="••••••••"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                disabled={isSubmitting}
                required
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="brutal-btn brutal-btn-primary w-full py-3 text-sm mt-2"
            >
              {isSubmitting ? "Please wait..." : mode === "signin" ? "Sign In →" : "Create Account →"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? (
              <>
                Don't have an account?{" "}
                <button
                  onClick={() => setMode("signup")}
                  disabled={isSubmitting}
                  className="font-semibold text-foreground underline decoration-2 underline-offset-2"
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => setMode("signin")}
                  disabled={isSubmitting}
                  className="font-semibold text-foreground underline decoration-2 underline-offset-2"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

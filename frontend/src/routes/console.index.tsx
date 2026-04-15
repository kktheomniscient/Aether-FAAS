import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Search, Plus, LogOut, Play, Clock } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clearAuthSession, getAuthSession, getAuthToken } from "@/lib/auth";
import { getMe, listFunctions, signOut } from "@/lib/api";

export const Route = createFileRoute("/console/")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !getAuthToken()) {
      throw redirect({ to: "/auth" });
    }
  },
  head: () => ({
    meta: [
      { title: "Console — Aether" },
      { name: "description", content: "Manage your Aether functions." },
    ],
  }),
  component: ConsolePage,
});

type ConsoleFunctionCard = {
  id: string;
  name: string;
  description: string;
  status: "ready" | "deploying" | "error";
  jobs: number;
  lastRunLabel: string;
};

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function toConsoleStatus(status: unknown): "ready" | "deploying" | "error" {
  if (typeof status !== "string") {
    return "ready";
  }
  const normalized = status.toLowerCase();
  if (normalized === "deploying") {
    return "deploying";
  }
  if (normalized === "error") {
    return "error";
  }
  return "ready";
}

function formatLastRunLabel(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "n/a";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "n/a";
  }
  return parsed.toLocaleString();
}

function ConsolePage() {
  const queryClient = useQueryClient();
  const navigate = Route.useNavigate();
  const [search, setSearch] = useState("");
  const userSession = getAuthSession();
  const token = getAuthToken();

  const sessionQuery = useQuery({
    queryKey: ["auth", "session", token],
    queryFn: () => getMe(token as string),
    enabled: Boolean(token),
    staleTime: 60_000,
    retry: false,
  });

  const functionsQuery = useQuery({
    queryKey: ["functions", token],
    queryFn: () => listFunctions(token as string),
    enabled: Boolean(token),
    staleTime: 30_000,
    retry: false,
  });

  const signOutMutation = useMutation({
    mutationFn: async () => {
      if (!token) {
        return { status: "signed_out" };
      }
      return signOut(token);
    },
  });

  const handleLogout = async () => {
    try {
      await signOutMutation.mutateAsync();
    } catch {
      // Local signout should still work if API is unreachable.
    }

    clearAuthSession();
    queryClient.removeQueries({ queryKey: ["auth"] });
    await navigate({ to: "/auth" });
  };

  const sessionEmail = sessionQuery.data?.email ?? userSession?.email;

  const functionCards = useMemo<ConsoleFunctionCard[]>(() => {
    const rawFunctions = functionsQuery.data?.functions ?? [];

    return rawFunctions
      .filter((fn) => fn.task_id.length > 0)
      .map((fn) => ({
        id: fn.task_id,
        name: asString(fn.name, `function-${fn.task_id.slice(0, 8)}`),
        description: asString(fn.description, "No description provided."),
        status: toConsoleStatus(fn.status),
        jobs:
          typeof fn.summary?.runs_count === "number"
            ? fn.summary.runs_count
            : 0,
        lastRunLabel: formatLastRunLabel(fn.summary?.last_run_at),
      }));
  }, [functionsQuery.data]);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = functionCards.filter(
    (f) =>
      f.name.toLowerCase().includes(normalizedSearch) ||
      f.description.toLowerCase().includes(normalizedSearch),
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Top Bar */}
      <header className="border-b-3 border-foreground bg-card px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center bg-neon border-2 border-foreground font-mono font-bold text-sm">
                Æ
              </div>
              <span className="font-bold">Aether</span>
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm font-semibold">Console</span>
            {sessionEmail && (
              <span className="text-xs text-muted-foreground">
                {sessionEmail}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={signOutMutation.isPending}
            className="brutal-btn brutal-btn-secondary px-4 py-2 text-sm flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            {signOutMutation.isPending ? "Signing out..." : "Logout"}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Search and actions */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search functions..."
              className="brutal-input w-full pl-10 pr-4 py-3 text-sm"
            />
          </div>
          <Link
            to="/console/new"
            className="brutal-btn brutal-btn-primary px-6 py-3 text-sm flex items-center gap-2 justify-center"
          >
            <Plus className="h-4 w-4" strokeWidth={3} />
            New Function
          </Link>
        </div>

        {/* Function Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {functionsQuery.isLoading && (
            <div className="brutal-card p-6 text-sm text-muted-foreground md:col-span-2 lg:col-span-3">
              Loading functions...
            </div>
          )}

          {functionsQuery.isError && (
            <div className="brutal-card p-6 text-sm text-destructive md:col-span-2 lg:col-span-3">
              {(functionsQuery.error as Error).message ||
                "Failed to load functions."}
            </div>
          )}

          {!functionsQuery.isLoading &&
            !functionsQuery.isError &&
            filtered.length === 0 && (
              <div className="brutal-card p-6 text-sm text-muted-foreground md:col-span-2 lg:col-span-3">
                No functions found.
              </div>
            )}

          {filtered.map((fn) => (
            <Link
              key={fn.id}
              to="/console/$functionId"
              params={{ functionId: fn.id }}
              className="brutal-card p-6 block"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-bold font-mono text-base">{fn.name}</h3>
                <span
                  className={`brutal-badge px-2 py-0.5 text-xs ${
                    fn.status === "ready"
                      ? "bg-neon"
                      : fn.status === "deploying"
                        ? "bg-chart-4"
                        : "bg-destructive text-destructive-foreground"
                  }`}
                >
                  {fn.status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                {fn.description}
              </p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Play className="h-3 w-3" /> {fn.jobs} runs
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {fn.lastRunLabel}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

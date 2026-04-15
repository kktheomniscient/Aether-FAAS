import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/auth";
import { deployTask } from "@/lib/api";

export const Route = createFileRoute("/console/new")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !getAuthToken()) {
      throw redirect({ to: "/auth" });
    }
  },
  head: () => ({
    meta: [{ title: "New Function — Aether" }],
  }),
  component: NewFunctionPage,
});

const DEFAULT_FUNCTION_CODE = `def handler(event, context):
    name = event.get("name", "World")
    return {"message": f"Hello, {name}!", "status": "success"}
`;

const DEFAULT_REQUIREMENTS = "";

function NewFunctionPage() {
  const navigate = Route.useNavigate();
  const token = getAuthToken();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (payload: {
      code: string;
      requirements: string;
      name?: string;
      description?: string;
    }) => {
      return deployTask(token as string, payload);
    },
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      setError("You must be signed in to create a function.");
      return;
    }

    setError(null);

    try {
      const response = await createMutation.mutateAsync({
        code: DEFAULT_FUNCTION_CODE,
        requirements: DEFAULT_REQUIREMENTS,
        name: name.trim() || undefined,
        description: description.trim() || undefined,
      });

      await navigate({
        to: "/console/$functionId",
        params: { functionId: response.task_id },
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to create function.",
      );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-3 border-foreground bg-card px-6 py-3">
        <div className="flex items-center gap-2 text-sm">
          <Link
            to="/console"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Console
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-bold">New Function</span>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-6 py-12">
        <h1 className="text-2xl font-bold mb-8">Create a new function</h1>
        {error && (
          <div className="mb-4 rounded-md border-2 border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-sm font-semibold block mb-1.5">
              Function Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="brutal-input w-full px-4 py-3 text-sm font-mono"
              placeholder="my-function"
              required
            />
          </div>
          <div>
            <label className="text-sm font-semibold block mb-1.5">
              Description
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="brutal-input w-full px-4 py-3 text-sm"
              placeholder="What does this function do?"
            />
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="brutal-btn brutal-btn-primary w-full py-3 text-sm block text-center mt-4"
          >
            {createMutation.isPending
              ? "Creating..."
              : "Create & Open Editor →"}
          </button>
        </form>
      </div>
    </div>
  );
}

import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { getAuthToken } from "@/lib/auth";

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

function NewFunctionPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-3 border-foreground bg-card px-6 py-3">
        <div className="flex items-center gap-2 text-sm">
          <Link to="/console" className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Console
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-bold">New Function</span>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-6 py-12">
        <h1 className="text-2xl font-bold mb-8">Create a new function</h1>
        <form className="space-y-4">
          <div>
            <label className="text-sm font-semibold block mb-1.5">Function Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="brutal-input w-full px-4 py-3 text-sm font-mono"
              placeholder="my-function"
              required
            />
          </div>
          <div>
            <label className="text-sm font-semibold block mb-1.5">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="brutal-input w-full px-4 py-3 text-sm"
              placeholder="What does this function do?"
            />
          </div>
          <Link
            to="/console/$functionId"
            params={{ functionId: "new" }}
            className="brutal-btn brutal-btn-primary w-full py-3 text-sm block text-center mt-4"
          >
            Create & Open Editor →
          </Link>
        </form>
      </div>
    </div>
  );
}

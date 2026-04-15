import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Save, Play, ChevronRight, ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/auth";
import { enqueueTask, getJob, getTask, updateTask } from "@/lib/api";

export const Route = createFileRoute("/console/$functionId")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !getAuthToken()) {
      throw redirect({ to: "/auth" });
    }
  },
  head: () => ({
    meta: [{ title: "Function Workspace — Aether" }],
  }),
  component: FunctionWorkspace,
});

type JobVisualStatus = "success" | "error" | "running" | "queued";

function metadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
): string {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function toJobVisualStatus(status: string | undefined): JobVisualStatus {
  const normalized = (status ?? "").toLowerCase();
  if (["finished", "completed", "success"].includes(normalized)) {
    return "success";
  }
  if (["failed", "error"].includes(normalized)) {
    return "error";
  }
  if (["started", "running"].includes(normalized)) {
    return "running";
  }
  return "queued";
}

function jobBadgeClass(status: JobVisualStatus): string {
  if (status === "success") {
    return "bg-neon";
  }
  if (status === "error") {
    return "bg-destructive text-destructive-foreground";
  }
  if (status === "running") {
    return "bg-chart-4";
  }
  return "bg-muted";
}

function jobStatusLabel(status: JobVisualStatus): string {
  if (status === "success") {
    return "Success";
  }
  if (status === "error") {
    return "Error";
  }
  if (status === "running") {
    return "Running";
  }
  return "Queued";
}

function resultLogs(result: unknown): string {
  if (!result || typeof result !== "object") {
    return "";
  }
  const logs = (result as { logs?: unknown }).logs;
  return typeof logs === "string" ? logs : "";
}

function formatJobTimeLabel(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "n/a";
  }
  return parsed.toLocaleString();
}

function formatDurationLabel(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/a";
  }
  if (value < 1) {
    return `${Math.round(value * 1000)}ms`;
  }
  return `${value.toFixed(2)}s`;
}

function FunctionWorkspace() {
  const queryClient = useQueryClient();
  const { functionId } = Route.useParams();
  const token = getAuthToken();
  const [code, setCode] = useState("");
  const [requirements, setRequirements] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"editor" | "jobs">("editor");
  const [hydratedTaskId, setHydratedTaskId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const taskQuery = useQuery({
    queryKey: ["task", functionId, token],
    queryFn: () => getTask(token as string, functionId),
    enabled: Boolean(token && functionId),
    staleTime: 10_000,
    retry: false,
  });

  useEffect(() => {
    if (!taskQuery.data || taskQuery.data.task_id === hydratedTaskId) {
      return;
    }

    setCode(taskQuery.data.code ?? "");
    setRequirements(taskQuery.data.requirements ?? "");
    setName(
      metadataString(
        taskQuery.data.metadata,
        "name",
        `function-${taskQuery.data.task_id.slice(0, 8)}`,
      ),
    );
    setDescription(
      metadataString(
        taskQuery.data.metadata,
        "description",
        "No description provided.",
      ),
    );
    setHydratedTaskId(taskQuery.data.task_id);
  }, [taskQuery.data, hydratedTaskId]);

  const jobs = taskQuery.data?.jobs ?? [];

  useEffect(() => {
    if (jobs.length === 0) {
      setSelectedJob(null);
      return;
    }
    if (selectedJob && jobs.some((job) => job.job_id === selectedJob)) {
      return;
    }
    setSelectedJob(jobs[0]?.job_id ?? null);
  }, [jobs, selectedJob]);

  const selectedJobQuery = useQuery({
    queryKey: ["job", selectedJob, token],
    queryFn: () => getJob(token as string, selectedJob as string),
    enabled: Boolean(token && selectedJob && activeTab === "jobs"),
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) {
        return 3_000;
      }
      return data.is_finished || data.is_failed ? false : 3_000;
    },
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      updateTask(token as string, functionId, {
        code,
        requirements,
        name,
        description,
      }),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({
        queryKey: ["task", functionId, token],
      });
    },
  });

  const runMutation = useMutation({
    mutationFn: () => enqueueTask(token as string, functionId),
    onSuccess: async (result) => {
      setActionError(null);
      setActiveTab("jobs");
      setSelectedJob(result.job_id);
      await queryClient.invalidateQueries({
        queryKey: ["task", functionId, token],
      });
    },
  });

  const handleSave = async () => {
    if (!token) {
      setActionError("You must be signed in to save this function.");
      return;
    }
    try {
      await saveMutation.mutateAsync();
    } catch (saveError) {
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save function.",
      );
    }
  };

  const handleRunNow = async () => {
    if (!token) {
      setActionError("You must be signed in to run this function.");
      return;
    }
    try {
      await runMutation.mutateAsync();
    } catch (runError) {
      setActionError(
        runError instanceof Error ? runError.message : "Failed to enqueue job.",
      );
    }
  };

  const selectedJobSummary = jobs.find((job) => job.job_id === selectedJob);
  const selectedJobStatus = toJobVisualStatus(
    selectedJobQuery.data?.status ?? selectedJobSummary?.status,
  );
  const selectedDurationSeconds =
    selectedJobQuery.data?.duration_seconds ??
    selectedJobSummary?.duration_seconds;
  const selectedTimeLabel = formatJobTimeLabel(
    selectedJobQuery.data?.started_at ??
      selectedJobSummary?.started_at ??
      selectedJobSummary?.enqueued_at ??
      selectedJobSummary?.created_at,
  );
  const selectedResult = selectedJobQuery.data?.result;
  const outputText = selectedJobQuery.isLoading
    ? "Loading..."
    : JSON.stringify(
        selectedResult ?? { message: "No result payload returned." },
        null,
        2,
      );
  const logsText = resultLogs(selectedResult);
  const logLines = logsText
    ? logsText.split(/\r?\n/).filter((line) => line.trim().length > 0)
    : ["No logs returned."];

  if (taskQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="brutal-card p-6 text-sm text-muted-foreground">
          Loading function...
        </div>
      </div>
    );
  }

  if (taskQuery.isError || !taskQuery.data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="brutal-card p-6 max-w-md">
          <p className="text-destructive text-sm mb-4">
            {(taskQuery.error as Error)?.message || "Failed to load function."}
          </p>
          <Link
            to="/console"
            className="brutal-btn brutal-btn-secondary px-4 py-2 text-sm inline-flex"
          >
            Back to Console
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Bar */}
      <header className="border-b-3 border-foreground bg-card px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Link
              to="/console"
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Console
            </Link>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="font-bold font-mono">
              {name || `function-${functionId.slice(0, 8)}`}
            </span>
            {selectedJob && activeTab === "jobs" && (
              <>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono text-muted-foreground">
                  {selectedJob}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="brutal-btn brutal-btn-secondary px-4 py-2 text-sm flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={handleRunNow}
              disabled={runMutation.isPending}
              className="brutal-btn brutal-btn-primary px-4 py-2 text-sm flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              {runMutation.isPending ? "Queueing..." : "Run Now"}
            </button>
          </div>
        </div>
      </header>

      {actionError && (
        <div className="px-6 py-3 border-b-3 border-foreground bg-destructive/10 text-destructive text-sm">
          {actionError}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b-3 border-foreground bg-card px-6">
        <div className="flex gap-0">
          <button
            onClick={() => setActiveTab("editor")}
            className={`px-6 py-3 text-sm font-semibold border-b-3 -mb-[3px] transition-colors ${
              activeTab === "editor"
                ? "border-neon bg-neon/10"
                : "border-transparent hover:bg-muted"
            }`}
          >
            Editor
          </button>
          <button
            onClick={() => setActiveTab("jobs")}
            className={`px-6 py-3 text-sm font-semibold border-b-3 -mb-[3px] transition-colors ${
              activeTab === "jobs"
                ? "border-neon bg-neon/10"
                : "border-transparent hover:bg-muted"
            }`}
          >
            Job History ({jobs.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex">
        {activeTab === "editor" ? (
          <div className="flex-1 flex flex-col lg:flex-row">
            {/* Code Editor */}
            <div className="flex-1 flex flex-col border-r-0 lg:border-r-3 border-foreground">
              <div className="bg-muted px-4 py-2 border-b-3 border-foreground">
                <span className="text-xs font-mono font-semibold text-muted-foreground">
                  handler.py
                </span>
              </div>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="flex-1 w-full p-6 font-mono text-sm leading-relaxed bg-card resize-none focus:outline-none min-h-[400px]"
                spellCheck={false}
              />
            </div>

            {/* Right Pane */}
            <div className="w-full lg:w-96 flex flex-col">
              {/* Metadata */}
              <div className="p-6 border-b-3 border-foreground">
                <h3 className="brutal-section-title text-muted-foreground mb-4">
                  Metadata
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold block mb-1">
                      Function Name
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="brutal-input w-full px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">
                      Description
                    </label>
                    <input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="brutal-input w-full px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Requirements */}
              <div className="p-6 flex-1">
                <h3 className="brutal-section-title text-muted-foreground mb-4">
                  Requirements.txt
                </h3>
                <textarea
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  className="brutal-input w-full p-3 font-mono text-sm leading-relaxed resize-none min-h-[120px]"
                  spellCheck={false}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Job History */
          <div className="flex-1 flex flex-col lg:flex-row">
            {/* Job List */}
            <div className="w-full lg:w-72 border-r-0 lg:border-r-3 border-foreground">
              <div className="bg-muted px-4 py-2 border-b-3 border-foreground">
                <span className="text-xs font-semibold text-muted-foreground brutal-section-title">
                  Recent Jobs
                </span>
              </div>
              <div className="divide-y-2 divide-foreground">
                {jobs.length === 0 && (
                  <div className="px-4 py-6 text-sm text-muted-foreground">
                    No jobs yet.
                  </div>
                )}

                {jobs.map((job) => {
                  const visualStatus = toJobVisualStatus(job.status);
                  return (
                    <button
                      key={job.job_id}
                      onClick={() => setSelectedJob(job.job_id)}
                      className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors ${
                        selectedJob === job.job_id
                          ? "bg-neon/15"
                          : "hover:bg-muted"
                      }`}
                    >
                      <div>
                        <span className="font-mono text-sm font-semibold">
                          {job.job_id}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {formatJobTimeLabel(
                            job.started_at ?? job.enqueued_at ?? job.created_at,
                          )}
                        </span>
                      </div>
                      <span
                        className={`brutal-badge px-2 py-0.5 text-xs ${jobBadgeClass(visualStatus)}`}
                      >
                        {jobStatusLabel(visualStatus)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Job Details */}
            <div className="flex-1 p-6">
              {selectedJob ? (
                <>
                  <div
                    className={`brutal-card p-4 mb-6 ${
                      selectedJobStatus === "success"
                        ? "bg-neon/20"
                        : selectedJobStatus === "error"
                          ? "bg-destructive/20"
                          : "bg-muted"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono font-bold">
                          {selectedJob}
                        </span>
                        <span className="block text-sm text-muted-foreground mt-0.5">
                          Duration:{" "}
                          {formatDurationLabel(selectedDurationSeconds)}
                        </span>
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          Started: {selectedTimeLabel}
                        </span>
                      </div>
                      <span
                        className={`brutal-badge px-3 py-1 ${jobBadgeClass(selectedJobStatus)}`}
                      >
                        {selectedJobStatus === "success"
                          ? "✓ Success"
                          : selectedJobStatus === "error"
                            ? "✗ Error"
                            : selectedJobStatus === "running"
                              ? "↻ Running"
                              : "… Queued"}
                      </span>
                    </div>
                  </div>

                  {selectedJobQuery.isError && (
                    <div className="mb-6 rounded-md border-2 border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {(selectedJobQuery.error as Error).message ||
                        "Failed to load job details."}
                    </div>
                  )}

                  <div className="space-y-6">
                    <div>
                      <h3 className="brutal-section-title text-muted-foreground mb-3">
                        Output
                      </h3>
                      <div className="brutal-card p-4 bg-foreground text-primary-foreground font-mono text-sm">
                        <pre>{outputText}</pre>
                      </div>
                    </div>

                    <div>
                      <h3 className="brutal-section-title text-muted-foreground mb-3">
                        Logs
                      </h3>
                      <div className="brutal-card p-4 bg-foreground text-primary-foreground font-mono text-xs leading-relaxed">
                        {logLines.map((line, index) => (
                          <p key={`${index}-${line}`} className="opacity-80">
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Select a job to view details
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

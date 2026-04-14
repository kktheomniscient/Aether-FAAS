import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Save, Play, ChevronRight, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { getAuthToken } from "@/lib/auth";

export const Route = createFileRoute("/console/$functionId")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !getAuthToken()) {
      throw redirect({ to: "/auth" });
    }
  },
  head: () => ({
    meta: [
      { title: "Function Workspace — Aether" },
    ],
  }),
  component: FunctionWorkspace,
});

const mockCode = `import requests
from datetime import datetime

def handler(event, context):
    """Process incoming data and return results."""
    name = event.get("name", "World")
    timestamp = datetime.now().isoformat()
    
    return {
        "message": f"Hello, {name}!",
        "timestamp": timestamp,
        "status": "success"
    }
`;

const mockRequirements = `requests==2.31.0
python-dateutil==2.8.2
`;

const mockJobs = [
  { id: "job-401", status: "success", time: "2m ago", duration: "1.2s" },
  { id: "job-400", status: "success", time: "15m ago", duration: "0.8s" },
  { id: "job-399", status: "error", time: "1h ago", duration: "3.4s" },
  { id: "job-398", status: "success", time: "2h ago", duration: "1.1s" },
  { id: "job-397", status: "success", time: "3h ago", duration: "0.9s" },
];

function FunctionWorkspace() {
  const { functionId } = Route.useParams();
  const [code, setCode] = useState(mockCode);
  const [requirements, setRequirements] = useState(mockRequirements);
  const [name, setName] = useState("hello-world");
  const [description, setDescription] = useState("A simple hello world endpoint");
  const [selectedJob, setSelectedJob] = useState<string | null>("job-401");
  const [activeTab, setActiveTab] = useState<"editor" | "jobs">("editor");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Bar */}
      <header className="border-b-3 border-foreground bg-card px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Link to="/console" className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Console
            </Link>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="font-bold font-mono">{name}</span>
            {selectedJob && activeTab === "jobs" && (
              <>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono text-muted-foreground">{selectedJob}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button className="brutal-btn brutal-btn-secondary px-4 py-2 text-sm flex items-center gap-2">
              <Save className="h-4 w-4" />
              Save
            </button>
            <button className="brutal-btn brutal-btn-primary px-4 py-2 text-sm flex items-center gap-2">
              <Play className="h-4 w-4" />
              Run Now
            </button>
          </div>
        </div>
      </header>

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
            Job History
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
                <span className="text-xs font-mono font-semibold text-muted-foreground">handler.py</span>
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
                <h3 className="brutal-section-title text-muted-foreground mb-4">Metadata</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold block mb-1">Function Name</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="brutal-input w-full px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">Description</label>
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
                <h3 className="brutal-section-title text-muted-foreground mb-4">Requirements.txt</h3>
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
                <span className="text-xs font-semibold text-muted-foreground brutal-section-title">Recent Jobs</span>
              </div>
              <div className="divide-y-2 divide-foreground">
                {mockJobs.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => setSelectedJob(job.id)}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors ${
                      selectedJob === job.id ? "bg-neon/15" : "hover:bg-muted"
                    }`}
                  >
                    <div>
                      <span className="font-mono text-sm font-semibold">{job.id}</span>
                      <span className="block text-xs text-muted-foreground">{job.time}</span>
                    </div>
                    <span
                      className={`brutal-badge px-2 py-0.5 text-xs ${
                        job.status === "success" ? "bg-neon" : "bg-destructive text-destructive-foreground"
                      }`}
                    >
                      {job.status}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Job Details */}
            <div className="flex-1 p-6">
              {selectedJob ? (
                <>
                  <div className={`brutal-card p-4 mb-6 ${
                    mockJobs.find((j) => j.id === selectedJob)?.status === "success"
                      ? "bg-neon/20"
                      : "bg-destructive/20"
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono font-bold">{selectedJob}</span>
                        <span className="block text-sm text-muted-foreground mt-0.5">
                          Duration: {mockJobs.find((j) => j.id === selectedJob)?.duration}
                        </span>
                      </div>
                      <span className={`brutal-badge px-3 py-1 ${
                        mockJobs.find((j) => j.id === selectedJob)?.status === "success"
                          ? "bg-neon"
                          : "bg-destructive text-destructive-foreground"
                      }`}>
                        {mockJobs.find((j) => j.id === selectedJob)?.status === "success" ? "✓ Success" : "✗ Error"}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h3 className="brutal-section-title text-muted-foreground mb-3">Output</h3>
                      <div className="brutal-card p-4 bg-foreground text-primary-foreground font-mono text-sm">
                        <pre>{JSON.stringify({ message: "Hello, World!", timestamp: "2026-04-14T10:30:00", status: "success" }, null, 2)}</pre>
                      </div>
                    </div>

                    <div>
                      <h3 className="brutal-section-title text-muted-foreground mb-3">Logs</h3>
                      <div className="brutal-card p-4 bg-foreground text-primary-foreground font-mono text-xs leading-relaxed">
                        <p className="text-neon">[INFO] Container started</p>
                        <p className="opacity-60">[INFO] Installing dependencies...</p>
                        <p className="opacity-60">[INFO] Running handler.py</p>
                        <p className="text-neon">[INFO] Function returned successfully</p>
                        <p className="opacity-60">[INFO] Container destroyed</p>
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

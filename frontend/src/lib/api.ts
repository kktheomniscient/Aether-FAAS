import { getApiBaseUrl } from "@/lib/auth";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  token?: string;
  body?: unknown;
};

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", token, body } = options;
  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as
    | { detail?: string }
    | T
    | null;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "detail" in payload &&
      typeof payload.detail === "string"
        ? payload.detail
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export type AuthPayload = {
  email: string;
  password: string;
};

export type SignInResponse = {
  access_token: string;
  token_type: string;
  email?: string;
};

export type SessionResponse = {
  email: string;
};

export type FunctionSummary = {
  task_id: string;
  owner?: string;
  name?: string;
  description?: string;
  status?: string;
  summary?: {
    runs_count?: number;
    last_run_at?: string | null;
    last_job_id?: string | null;
  };
};

export type ListFunctionsResponse = {
  functions: FunctionSummary[];
};

export type TaskJobSummary = {
  job_id: string;
  status: string;
  is_finished?: boolean;
  is_failed?: boolean;
  created_at?: string | null;
  enqueued_at?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
};

export type TaskExecutionSummary = {
  runs_count: number;
  last_run_at: string | null;
  last_job_id: string | null;
};

export type TaskResponse = {
  task_id: string;
  owner: string;
  code: string;
  requirements: string;
  metadata: Record<string, unknown>;
  summary?: TaskExecutionSummary;
  jobs: TaskJobSummary[];
};

export type DeployPayload = {
  code: string;
  requirements?: string;
  name?: string;
  description?: string;
};

export type DeployResponse = {
  status: string;
  task_id: string;
  owner: string;
};

export type EnqueueResponse = {
  status: string;
  task_id: string;
  job_id: string;
};

export type TaskJobsResponse = {
  task_id: string;
  job_count: number;
  summary?: TaskExecutionSummary;
  jobs: TaskJobSummary[];
};

export type JobResponse = {
  job_id: string;
  task_id?: string;
  status: string;
  result: unknown;
  is_finished: boolean;
  is_failed: boolean;
  exc_info?: string | null;
  created_at?: string | null;
  enqueued_at?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
};

export function signUp(
  payload: AuthPayload,
): Promise<{ email: string; status: string }> {
  return request("/auth/signup", { method: "POST", body: payload });
}

export function signIn(payload: AuthPayload): Promise<SignInResponse> {
  return request("/auth/signin", { method: "POST", body: payload });
}

export function signOut(token: string): Promise<{ status: string }> {
  return request("/auth/signout", { method: "POST", token });
}

export function getMe(token: string): Promise<SessionResponse> {
  return request("/auth/me", { token });
}

export function listFunctions(token: string): Promise<ListFunctionsResponse> {
  return request("/functions", { token });
}

export function deployTask(
  token: string,
  payload: DeployPayload,
): Promise<DeployResponse> {
  return request("/deploy", { method: "POST", token, body: payload });
}

export function getTask(token: string, taskId: string): Promise<TaskResponse> {
  return request(`/tasks/${encodeURIComponent(taskId)}`, { token });
}

export function updateTask(
  token: string,
  taskId: string,
  payload: Partial<DeployPayload> & { metadata?: Record<string, unknown> },
): Promise<{
  status: string;
  task_id: string;
  owner: string;
  updated_fields: string[];
}> {
  return request(`/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export function enqueueTask(
  token: string,
  taskId: string,
): Promise<EnqueueResponse> {
  return request(`/enqueue/${encodeURIComponent(taskId)}`, {
    method: "POST",
    token,
  });
}

export function listTaskJobs(
  token: string,
  taskId: string,
): Promise<TaskJobsResponse> {
  return request(`/tasks/${encodeURIComponent(taskId)}/jobs`, { token });
}

export function listTaskJobTimes(
  token: string,
  taskId: string,
): Promise<TaskJobsResponse> {
  return request(`/tasks/${encodeURIComponent(taskId)}/job-times`, { token });
}

export function getJob(token: string, jobId: string): Promise<JobResponse> {
  return request(`/job/${encodeURIComponent(jobId)}`, { token });
}

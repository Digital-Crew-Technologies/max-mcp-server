import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

// HTTP access to max-agent's /api/v1/tasks routes.
//
// ── WHAT IS DELIBERATELY MISSING ────────────────────────────────────────────
// There is no approveTask, no rejectTask and no deleteTask in this file, and
// there must never be one. max-agent answers all three with 403 for API-key
// callers (tasksService.reviewSuggestion / deleteTask require actor.type ===
// "user") precisely so an agent cannot approve its own suggestion. A wrapper
// here could not succeed — it would only give a model something to call and
// retry. Agents propose; humans dispose. Agents retire work through the
// cancelled status, which keeps the row and its lineage.
//
// The workspace is never a parameter: max-agent derives it from the bearer.

/**
 * Query params for GET /api/v1/tasks. camelCase to match max-agent's handler;
 * the tool layer maps its snake_case args onto this.
 */
export type ListTasksParams = {
  /** Filters WITHIN the authenticated workspace — never tenant selectors. */
  prospectId?: string;
  sessionId?: string;
  status?: readonly string[];
  assigneeUserId?: string;
  assigneeAgent?: string;
  limit?: number;
  cursor?: string;
};

/**
 * GET /api/v1/tasks — workspace tasks, newest first, keyset-paginated on
 * created_at (the route filters `created_at < cursor`, orders DESC).
 *
 * 200 → { data: TaskDto[] }   ← note: NO nextCursor. See tools.ts.
 */
export async function listTasks(
  token: string,
  params: ListTasksParams = {},
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/tasks${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

/** GET /api/v1/tasks/:id — one task. 404 if it is not in this workspace. */
export async function getTask(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/tasks/${id}`), {
    headers: authHeaders(token),
  });
}

/**
 * POST /api/v1/tasks — create a task.
 *
 * 201 → { data: TaskDto } | 200 → { data: TaskDto, deduplicated: true }
 *
 * Callers in this repo only ever send status='suggested' (see tools.ts).
 */
export async function createTask(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/tasks`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

/**
 * PATCH /api/v1/tasks/:id — edit fields and/or make a legal status transition.
 *
 * `body.expectedVersion` (the task's last-read updatedAt) is REQUIRED by the
 * route. 409 on mismatch, with the current task in the body.
 */
export async function patchTask(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/tasks/${id}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

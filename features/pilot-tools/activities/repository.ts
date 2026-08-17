import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

/**
 * Query params for GET /api/v1/activities. Snake_case filters + camelCase
 * paging, matching what max-agent's handler parses; the tool layer takes
 * snake_case args and maps them here.
 *
 * There is no workspaceId field, deliberately: max-agent derives the
 * workspace from the bearer and ignores anything a caller sends.
 */
export type ListActivitiesParams = {
  /** Filters WITHIN the authenticated workspace — never tenant selectors. */
  prospect_id?: string;
  organization_id?: string;
  deal_id?: string;
  type?: string;
  page?: number;
  pageSize?: number;
};

/**
 * GET /api/v1/activities — one record's unified timeline, pinned first then
 * newest first. At least one of prospect_id / organization_id / deal_id is
 * required — the route refuses a workspace-wide dump (400).
 *
 * 200 → { data: Activity[], count, page, pageSize }
 */
export async function listActivities(
  token: string,
  params: ListActivitiesParams,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/activities${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

/**
 * POST /api/v1/activities/notes — write a note onto a record's timeline.
 *
 * 201 → { data: Activity } | 400 no entity link / empty body.
 */
export async function createNote(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/activities/notes`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

/**
 * POST /api/v1/activities/calls — log a call manually onto a record's
 * timeline.
 *
 * 201 → { data: Activity } | 400 no entity link / bad outcome.
 */
export async function logCall(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/activities/calls`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

/**
 * PATCH /api/v1/activities/:id — edit a note's body/subject, or pin/unpin any
 * activity. System-written activities (emails, meetings, stage changes, …)
 * reject content edits — the timeline stays honest.
 *
 * 200 → { data: Activity } | 400 not editable | 404 not found.
 */
export async function updateActivity(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/activities/${id}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

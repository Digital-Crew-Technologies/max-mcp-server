import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

/**
 * Query params for GET /api/v1/meeting-hub/sessions. camelCase because that is
 * what max-agent's handler parses; the tool layer takes snake_case args and
 * maps them here.
 *
 * There is no workspaceId field, deliberately: max-agent derives the workspace
 * from the bearer and ignores anything a caller sends. See schema.ts.
 */
export type ListSessionsParams = {
  /** Filter WITHIN the authenticated workspace — never a tenant selector. */
  prospectId?: string;
  status?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
};

/**
 * GET /api/v1/meeting-hub/sessions — the meetings list and the prospect meeting
 * feed (?prospectId=…).
 *
 * 200 → { data: MeetingSessionSummaryDto[], nextCursor: string | null }
 * 400 → { error: "Invalid query parameters", details: [...] }
 *
 * Keyset pagination: echo `nextCursor` back as `cursor`; null means last page.
 */
export async function listSessions(
  token: string,
  params: ListSessionsParams = {},
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/meeting-hub/sessions${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

/**
 * GET /api/v1/meeting-hub/sessions/:id — one meeting in full.
 *
 * 200 → { data: MeetingSessionDetailDto } | 404 → { error: "Session not found" }
 *
 * A session in another workspace reads back as 404, never 403.
 */
export async function getSession(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/meeting-hub/sessions/${id}`), {
    headers: authHeaders(token),
  });
}

/**
 * GET /api/v1/meeting-hub/sessions/:id/transcript[?version=N] — one transcript
 * version (the current one by default; any historical number on request).
 *
 * 200 → { data: TranscriptVersionDto } | 400 invalid version | 404 not found.
 *
 * The response carries the WHOLE version's segments; the tool layer windows
 * them for token control (this route has no paging of its own).
 */
export async function getTranscript(
  token: string,
  id: string,
  version?: number,
): Promise<Response> {
  const qs = buildQuery({ version });
  return fetchWithRetry(
    apiUrl(`/api/v1/meeting-hub/sessions/${id}/transcript${qs}`),
    { headers: authHeaders(token) },
  );
}

/**
 * GET /api/v1/meeting-hub/sessions/:id/summary — the current summary.
 *
 * 200 → { data: MeetingSummaryDto } | 200 → { data: null } (no summary yet) |
 * 404 → { error: "Session not found" }.
 *
 * `data: null` (200) is "still processing / no summary", which is deliberately
 * distinct from 404 "no such meeting".
 */
export async function getSummary(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/meeting-hub/sessions/${id}/summary`), {
    headers: authHeaders(token),
  });
}

/**
 * GET /api/v1/meeting-hub/sessions/:id/participants — the meeting roster.
 *
 * 200 → { data: MeetingParticipantDto[] } | 404 → { error: "Session not found" }.
 *
 * Unpaginated by design upstream: bounded by the size of a meeting, not by
 * time.
 */
export async function listParticipants(
  token: string,
  id: string,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/meeting-hub/sessions/${id}/participants`),
    { headers: authHeaders(token) },
  );
}

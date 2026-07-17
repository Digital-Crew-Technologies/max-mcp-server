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

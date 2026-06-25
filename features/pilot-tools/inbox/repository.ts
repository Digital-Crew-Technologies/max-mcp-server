import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

// Thin HTTP repository for max-agent's /api/v1/inbox/drafts endpoints.
// max-agent owns the agent_action_drafts table and the auth/RLS rules; this
// repo just speaks JSON to it. Standard fetchWithRetry semantics (timeout,
// breaker, dead-letter on write failures).

export async function inboxCreateDraft(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/inbox/drafts`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function inboxListDrafts(
  token: string,
  query: Record<string, unknown> = {},
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/inbox/drafts${buildQuery(query)}`), {
    method: "GET",
    headers: authHeaders(token),
  });
}

export async function inboxGetDraft(
  token: string,
  draftId: string,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/inbox/drafts/${encodeURIComponent(draftId)}`), {
    method: "GET",
    headers: authHeaders(token),
  });
}

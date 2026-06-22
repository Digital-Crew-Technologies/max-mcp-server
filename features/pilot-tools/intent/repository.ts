import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

// All intent calls go through max-agent's /api/v1/intent/* routes. That layer
// enforces workspace scoping via the auth gate (JWT or API key + scope), so the
// MCP server only needs the user's standard bearer token — same auth model as
// prospects, Claire, enrichment, etc.
//
// approve_proposal is the heavy one: max-agent builds the list, creates the
// draft campaign, and launches it (maxDuration=300 on that route), so give it a
// long timeout and no retries (a retry could double-launch).

const APPROVE_TIMEOUT_MS = 290_000;
const APPROVE_CONFIG = { timeoutMs: APPROVE_TIMEOUT_MS, maxRetries: 0 };

export async function createTrigger(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/intent/triggers`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function listTriggers(
  token: string,
  params: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/intent/triggers${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export async function disableTrigger(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/intent/triggers/${id}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({}),
  });
}

export async function listSignals(token: string, triggerId: string): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/intent/signals${buildQuery({ trigger_id: triggerId })}`),
    { headers: authHeaders(token) },
  );
}

export async function listProposals(
  token: string,
  params: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/intent/proposals${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export async function getProposal(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/intent/proposals/${id}`), {
    headers: authHeaders(token),
  });
}

export async function approveProposal(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/intent/proposals/${id}/approve`),
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
    APPROVE_CONFIG,
  );
}

export async function rejectProposal(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/intent/proposals/${id}/reject`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({}),
  });
}

export async function modifyProposal(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/intent/proposals/${id}/modify`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

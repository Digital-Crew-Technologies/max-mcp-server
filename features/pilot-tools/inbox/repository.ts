import { apiUrl, authHeaders, fetchWithRetry } from "../shared";

// All inbox calls go through max-agent's /api/v1/inbox/* routes. That layer
// enforces workspace scoping via the auth gate (JWT or API key + scope) and
// holds the Unipile credentials needed to send replies in-thread, so the MCP
// server only needs the user's standard bearer token — same auth model as
// prospects, Claire, enrichment, intent, etc.
//
// approve_inbox_draft sends a reply through Unipile (a side effect), so disable
// retries (a retry could double-send) and give it a longer timeout. Reads
// (status, drafts) are fast.

const SEND_TIMEOUT_MS = 120_000;
const SEND_CONFIG = { timeoutMs: SEND_TIMEOUT_MS, maxRetries: 0 };

export async function setAutopilot(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/inbox/autopilot`), {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function getAutopilotStatus(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/inbox/autopilot`), {
    headers: authHeaders(token),
  });
}

export async function listDrafts(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/inbox/drafts`), {
    headers: authHeaders(token),
  });
}

export async function approveDraft(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/inbox/drafts/${id}/approve`),
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
    SEND_CONFIG,
  );
}

export async function rejectDraft(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/inbox/drafts/${id}/reject`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({}),
  });
}


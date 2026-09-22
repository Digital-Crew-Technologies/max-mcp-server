import { apiUrl, authHeaders, fetchWithRetry } from "../shared";

// The managed (Digital Crew credits) search surface. max-agent runs the
// provider chain itself — GetLeads first, Explorium as the fallback — so these
// calls never name Apollo.

export async function autoCreateProspectList(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospect-lists/auto/create-list`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

// The preview is a real, billed provider run with no idempotency key; it can
// walk the whole chain synchronously, so give it room and never retry it.
export async function previewOrganizationSearch(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/organizations/search`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  }, { timeoutMs: 120_000, maxRetries: 0 });
}

export async function autoCreateOrganizationList(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/organizations/search/create-list`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

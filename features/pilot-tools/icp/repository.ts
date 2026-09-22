import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

// Ideal Customer Profiles: max-agent /api/v1/icp/* (scopes icp:read / icp:write).
// Every route accepts a scoped workspace API key.
//
// generate is a model call (route maxDuration=90) that charges workspace
// tokens, so it gets a long timeout and no retries: a retried timeout would
// run — and bill — the generation twice.

const GENERATE_CONFIG = { timeoutMs: 95_000, maxRetries: 0 };

const BASE = "/api/v1/icp";

export async function listIcps(
  token: string,
  params: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`${BASE}${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export async function getIcp(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${BASE}/${encodeURIComponent(id)}`), {
    headers: authHeaders(token),
  });
}

export async function createIcp(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(BASE), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function updateIcp(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`${BASE}/${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function deleteIcp(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${BASE}/${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export async function listIcpLinks(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${BASE}/${encodeURIComponent(id)}/links`), {
    headers: authHeaders(token),
  });
}

export async function createIcpLink(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`${BASE}/${encodeURIComponent(id)}/links`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function deleteIcpLink(
  token: string,
  id: string,
  linkId: string,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`${BASE}/${encodeURIComponent(id)}/links/${encodeURIComponent(linkId)}`),
    { method: "DELETE", headers: authHeaders(token) },
  );
}

export async function listIcpLinksForRecord(
  token: string,
  params: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`${BASE}/links${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export async function generateIcp(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`${BASE}/generate`),
    { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) },
    GENERATE_CONFIG,
  );
}

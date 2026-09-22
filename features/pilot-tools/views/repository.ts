import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

// Saved list views: max-agent /api/v1/views/* (scopes views:read / views:write).

const BASE = "/api/v1/views";

export async function listViews(
  token: string,
  params: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`${BASE}${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export async function getView(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${BASE}/${encodeURIComponent(id)}`), {
    headers: authHeaders(token),
  });
}

export async function createView(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(BASE), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function updateView(
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

export async function deleteView(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${BASE}/${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

export async function listProspects(
  token: string,
  params: Record<string, unknown> = {},
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospects${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export async function getProspect(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospects/${id}`), { headers: authHeaders(token) });
}

export async function createProspect(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospects`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function updateProspect(token: string, id: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospects/${id}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function deleteProspect(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospects/${id}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export async function bulkImportProspects(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospects/bulk-import`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function bulkDeleteProspects(token: string, ids: string[]): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospects/bulk-delete`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ ids }),
  });
}

export async function getProspectCampaignActivity(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospects/${id}/campaign-activity`), { headers: authHeaders(token) });
}

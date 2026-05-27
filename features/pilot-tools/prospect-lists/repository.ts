import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

export async function listProspectLists(
  token: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospect-lists${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export async function getProspectList(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospect-lists/${id}`), { headers: authHeaders(token) });
}

export async function createProspectList(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospect-lists`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function updateProspectList(token: string, id: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospect-lists/${id}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function deleteProspectList(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospect-lists/${id}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export async function listProspectListMembers(
  token: string,
  id: string,
  params: Record<string, unknown> = {},
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospect-lists/${id}/prospects${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export async function addProspectsToList(token: string, id: string, prospectIds: string[]): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospect-lists/${id}/prospects`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ prospect_ids: prospectIds }),
  });
}

export async function removeProspectsFromList(token: string, id: string, prospectIds: string[]): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospect-lists/${id}/prospects`), {
    method: "DELETE",
    headers: authHeaders(token),
    body: JSON.stringify({ prospect_ids: prospectIds }),
  });
}

export async function searchProspectLists(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospect-lists/search`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function importProspectListCsv(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospect-lists/import-csv`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

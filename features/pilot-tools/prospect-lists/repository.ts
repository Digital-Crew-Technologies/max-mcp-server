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

const listPath = (id: string) => `/api/v1/prospect-lists/${encodeURIComponent(id)}`;

export async function listProspectListOrganizations(
  token: string,
  id: string,
  params: Record<string, unknown> = {},
): Promise<Response> {
  return fetchWithRetry(apiUrl(`${listPath(id)}/organizations${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export async function listProspectListMemberIds(
  token: string,
  id: string,
  params: Record<string, unknown> = {},
): Promise<Response> {
  return fetchWithRetry(apiUrl(`${listPath(id)}/prospects/ids${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export async function getProspectListShareLink(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${listPath(id)}/share-link`), { headers: authHeaders(token) });
}

export async function createProspectListShareLink(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${listPath(id)}/share-link`), {
    method: "POST",
    headers: authHeaders(token),
  });
}

export async function revokeProspectListShareLink(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${listPath(id)}/share-link`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

// Creates a list row (status "pending") that a cron runs later on the chosen
// LinkedIn account — not idempotent unless idempotency_key is sent, so no retry.
export async function createLinkedInProspectList(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/prospect-lists/linkedin/create-list`),
    { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) },
    { maxRetries: 0 },
  );
}

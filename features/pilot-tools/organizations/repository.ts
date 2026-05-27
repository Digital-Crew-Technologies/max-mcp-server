import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

export async function listOrganizations(
  token: string,
  params: Record<string, unknown> = {},
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/organizations${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export async function getOrganization(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/organizations/${id}`), { headers: authHeaders(token) });
}

export async function createOrganization(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/organizations`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function updateOrganization(token: string, id: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/organizations/${id}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function deleteOrganization(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/organizations/${id}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export async function bulkImportOrganizations(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/organizations/bulk-import`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function bulkDeleteOrganizations(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/organizations/bulk-delete`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

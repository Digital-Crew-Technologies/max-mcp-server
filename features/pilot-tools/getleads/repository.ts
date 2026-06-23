import { apiUrl, authHeaders, fetchWithRetry } from "../shared";

export async function getleadsCreateList(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/getleads/people/create-list`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function getleadsAddMore(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/getleads/people/add-more`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

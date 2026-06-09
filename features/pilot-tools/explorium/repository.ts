import { apiUrl, authHeaders, fetchWithRetry } from "../shared";

export async function exploriumCreateList(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/explorium/people/create-list`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function exploriumAddMore(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/explorium/people/add-more`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

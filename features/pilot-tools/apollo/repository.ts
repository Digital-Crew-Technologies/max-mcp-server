import { apiUrl, authHeaders, fetchWithRetry } from "../shared";

export async function apolloCreateList(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/apollo/people/create-list`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function apolloAddMore(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/apollo/people/add-more`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

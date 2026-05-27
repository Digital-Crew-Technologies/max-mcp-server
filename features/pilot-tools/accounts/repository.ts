import { apiUrl, authHeaders, fetchWithRetry } from "../shared";

export async function listAccounts(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/accounts`), { headers: authHeaders(token) });
}

export async function getAccount(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/accounts/${id}`), { headers: authHeaders(token) });
}

export async function updateAccount(token: string, id: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/accounts/${id}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function disconnectAccount(token: string, accountId: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/accounts?account_id=${accountId}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export async function getAccountRateLimits(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/accounts/${id}/rate-limits`), { headers: authHeaders(token) });
}

export async function updateAccountRateLimit(token: string, id: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/account-rate-limits/${id}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function hostedAuthLink(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/unipile/hosted-auth/link`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}
